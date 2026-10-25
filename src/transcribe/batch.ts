import { Notice, Platform, TFile, type Plugin } from "obsidian";
import { isVideoExtension } from "../videoFileTypes";
import type { SubtitleCue } from "../subtitles/cues";
import { showCreateProgressNotice } from "../ui/createProgressNotice";
import type { VideoSubtitleSettings } from "../settings";
import {
  clampPercent,
  formatCreateProgress,
  formatRemaining,
  type CreateProgressPhase
} from "./progress";
import type { TranscribeRange } from "./range";
import {
  cleanupTranscriber,
  clearCreateResume,
  releaseTranscriber,
  transcribeVideoFile,
  transcriberRoot,
  vaultFileAbsPath
} from "./runtime";

export const ENCRYPTED_FILES_PREFIX = "Encrypted Files";

export type CreateJob = {
  path: string;
  range: TranscribeRange | null;
};

export type CreateQueueSnapshot = {
  running: boolean;
  currentName: string;
  completed: number;
  total: number;
  currentPercent: number;
  currentRemainingSec: number | null;
  currentPhase: CreateProgressPhase;
  overallPercent: number;
  overallRemainingSec: number | null;
  lastMessage: string;
};

export type CreateQueueHost = Plugin & {
  subtitleSettings: VideoSubtitleSettings;
  saveSettings: () => Promise<void>;
  applyGenerated: (
    file: TFile,
    cues: readonly SubtitleCue[],
    reload: boolean,
    range: TranscribeRange | null
  ) => Promise<boolean>;
};

export function isEncryptedVaultPath(path: string): boolean {
  return path === ENCRYPTED_FILES_PREFIX || path.startsWith(`${ENCRYPTED_FILES_PREFIX}/`);
}

export function vaultVideoFiles(files: readonly TFile[]): TFile[] {
  return files.filter((file) => isVideoExtension(file.extension) && !isEncryptedVaultPath(file.path));
}

export function bumpJobs(pending: CreateJob[], job: CreateJob): { pending: CreateJob[]; kind: "moved" | "queued" } {
  const exists = pending.some((row) => row.path === job.path);
  return {
    pending: [job, ...pending.filter((row) => row.path !== job.path)],
    kind: exists ? "moved" : "queued"
  };
}

export function overallProgressPercent(completed: number, total: number, currentPercent: number): number {
  if (!(total > 0)) return 0;
  return clampPercent(((completed + clampPercent(currentPercent) / 100) / total) * 100);
}

export function overallRemainingSec(input: {
  currentRemainingSec: number | null;
  queuedCount: number;
  queuedBytes: number;
  completedCount: number;
  completedBytes: number;
  completedElapsedMs: number;
}): number | null {
  const current =
    input.currentRemainingSec != null && input.currentRemainingSec > 0 ? input.currentRemainingSec : 0;
  let queuedEst = 0;
  if (input.queuedCount > 0 && input.completedCount > 0 && input.completedElapsedMs > 0) {
    if (input.completedBytes > 0 && input.queuedBytes > 0) {
      queuedEst = (input.queuedBytes * input.completedElapsedMs) / input.completedBytes / 1000;
    } else {
      queuedEst = (input.queuedCount * input.completedElapsedMs) / input.completedCount / 1000;
    }
  }
  const total = current + queuedEst;
  if (!(total > 0)) return null;
  return Math.max(1, Math.round(total));
}

export function formatBatchOverall(
  completed: number,
  total: number,
  remainingSec: number | null
): string {
  const remaining = formatRemaining(remainingSec);
  const label = `All videos… ${completed}/${total}`;
  return remaining ? `${label} · ${remaining}` : label;
}

export function formatBatchCurrent(
  name: string,
  percent: number,
  remainingSec: number | null,
  phase: CreateProgressPhase
): string {
  return `${name} · ${formatCreateProgress(percent, remainingSec, phase)}`;
}

export function formatBatchResult(ok: number, failed: number): string {
  if (ok > 0 && failed === 0) {
    return ok === 1 ? "Added generated subtitles to the video." : `Added generated subtitles to ${ok} videos.`;
  }
  if (ok > 0) return `Added generated subtitles to ${ok} videos. ${failed} failed.`;
  if (failed > 0) return "Could not create subtitles for those videos.";
  return "";
}

export function idleQueueSnapshot(): CreateQueueSnapshot {
  return {
    running: false,
    currentName: "",
    completed: 0,
    total: 0,
    currentPercent: 0,
    currentRemainingSec: null,
    currentPhase: "load",
    overallPercent: 0,
    overallRemainingSec: null,
    lastMessage: ""
  };
}

function fileSize(file: TFile): number {
  const size = file.stat?.size;
  return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
}

export class CreateQueue {
  private pending: CreateJob[] = [];
  private current: CreateJob | null = null;
  private currentFile: TFile | null = null;
  private readonly files = new Map<string, TFile>();
  private completed = 0;
  private failed = 0;
  private total = 0;
  private currentPercent = 0;
  private currentRemainingSec: number | null = null;
  private currentPhase: CreateProgressPhase = "load";
  private completedBytes = 0;
  private completedElapsedMs = 0;
  private batchMode = false;
  private lastMessage = "";
  private aborted = false;
  private worker: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly plugin: CreateQueueHost) {}

  get running(): boolean {
    return this.worker !== null;
  }

  snapshot(): CreateQueueSnapshot {
    const queuedBytes = this.pending.reduce((sum, job) => {
      const file = this.files.get(job.path);
      return sum + (file ? fileSize(file) : 0);
    }, 0);
    return {
      running: this.running,
      currentName: this.currentFile?.name ?? "",
      completed: this.completed,
      total: this.total,
      currentPercent: this.currentPercent,
      currentRemainingSec: this.currentRemainingSec,
      currentPhase: this.currentPhase,
      overallPercent: overallProgressPercent(this.completed, this.total, this.currentPercent),
      overallRemainingSec: overallRemainingSec({
        currentRemainingSec: this.currentRemainingSec,
        queuedCount: this.pending.length,
        queuedBytes,
        completedCount: this.completed,
        completedBytes: this.completedBytes,
        completedElapsedMs: this.completedElapsedMs
      }),
      lastMessage: this.lastMessage
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(files: readonly TFile[], fromSettings = true): void {
    for (const file of files) this.remember(file);
    for (const file of files) {
      this.pending = bumpJobs(this.pending, { path: file.path, range: null }).pending;
    }
    if (fromSettings) {
      this.batchMode = true;
      this.lastMessage = "";
    }
    this.syncTotal();
    this.notify();
    this.ensureWorker();
  }

  prioritize(file: TFile, range: TranscribeRange | null = null): "current" | "moved" | "queued" {
    this.remember(file);
    if (this.current?.path === file.path) return "current";
    const next = bumpJobs(this.pending, { path: file.path, range });
    this.pending = next.pending;
    this.syncTotal();
    this.notify();
    this.ensureWorker();
    return next.kind;
  }

  abort(): void {
    this.aborted = true;
    this.pending = [];
    this.notify();
  }

  private remember(file: TFile): void {
    this.files.set(file.path, file);
  }

  private syncTotal(): void {
    this.total = this.completed + (this.current ? 1 : 0) + this.pending.length;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.aborted = false;
    this.worker = this.run().finally(() => {
      this.worker = null;
      this.notify();
    });
  }

  private async run(): Promise<void> {
    const keep = this.plugin.subtitleSettings.keepTranscriber;
    let root = "";
    try {
      if (Platform.isDesktopApp) root = transcriberRoot(this.plugin);
      while (!this.aborted) {
        const job = this.pending.shift();
        if (!job) break;
        const file = this.resolveFile(job.path);
        this.current = job;
        this.currentFile = file;
        this.currentPercent = 0;
        this.currentRemainingSec = null;
        this.currentPhase = "load";
        this.syncTotal();
        this.notify();
        if (!file) {
          this.failed += 1;
          this.completed += 1;
          this.current = null;
          this.currentFile = null;
          continue;
        }
        const started = Date.now();
        try {
          await this.process(file, job.range);
        } catch (error) {
          this.failed += 1;
          console.error(error);
        }
        this.completed += 1;
        this.completedElapsedMs += Math.max(1, Date.now() - started);
        this.completedBytes += fileSize(file);
        this.current = null;
        this.currentFile = null;
        this.currentPercent = 0;
        this.currentRemainingSec = null;
        this.syncTotal();
        this.notify();
      }
      if (this.batchMode) this.lastMessage = formatBatchResult(this.completed - this.failed, this.failed);
    } finally {
      this.pending = [];
      this.current = null;
      this.currentFile = null;
      this.batchMode = false;
      this.completed = 0;
      this.failed = 0;
      this.total = 0;
      this.completedBytes = 0;
      this.completedElapsedMs = 0;
      if (root) {
        try {
          if (!keep) await releaseTranscriber();
          cleanupTranscriber(root, keep);
        } catch (error) {
          console.error(error);
        }
      }
    }
  }

  private resolveFile(path: string): TFile | null {
    const known = this.files.get(path);
    if (known) return known;
    const found = this.plugin.app.vault.getAbstractFileByPath(path);
    return found instanceof TFile ? found : null;
  }

  private async process(file: TFile, range: TranscribeRange | null): Promise<void> {
    if (!Platform.isDesktopApp) throw new Error("Creating subtitles needs desktop Obsidian.");
    const win = this.plugin.app.workspace.containerEl.win ?? window;
    const status = this.batchMode ? null : showCreateProgressNotice();
    try {
      const cues = await transcribeVideoFile(
        this.plugin,
        vaultFileAbsPath(this.plugin, file),
        this.plugin.subtitleSettings,
        win,
        (percent, remainingSec, phase) => {
          const nextPhase = phase ?? this.currentPhase;
          this.currentPercent = percent;
          this.currentRemainingSec = remainingSec === undefined ? this.currentRemainingSec : remainingSec;
          this.currentPhase = nextPhase;
          this.notify();
          status?.setPercent(percent, remainingSec, phase);
        },
        async (partial) => {
          await this.plugin.applyGenerated(file, partial, false, range);
        },
        range
      );
      if (cues.length === 0) {
        status?.hide();
        clearCreateResume(this.plugin);
        if (!this.batchMode) new Notice("The transcriber returned no speech.");
        return;
      }
      status?.setPercent(100, null, "work");
      const saved = await this.plugin.applyGenerated(file, cues, true, range);
      status?.hide();
      if (saved) {
        clearCreateResume(this.plugin);
        if (!this.batchMode) new Notice("Added generated subtitles to the video.");
      }
    } catch (error) {
      status?.hide();
      if (!this.batchMode) {
        const message = error instanceof Error && error.message ? error.message : "Could not create subtitles.";
        new Notice(message);
      }
      throw error;
    }
  }
}
