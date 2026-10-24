import { Menu, Notice, Platform, TFile, type Plugin } from "obsidian";
import { isGeneratedTrack, spliceGeneratedTrack, upsertGeneratedTrack } from "../subtitles/generatedTrack";
import { cleanupTranscriber, clearCreateResume, transcriberRoot, transcribeVideoFile, vaultFileAbsPath } from "../transcribe/runtime";
import { pickAccuracyForHardware } from "../transcribe/hardware";
import { readHardware } from "../transcribe/node";
import { videoDurationSec, type TranscribeRange } from "../transcribe/range";
import { showCreateProgressNotice } from "../ui/createProgressNotice";
import { promptCreateRange } from "../ui/createRangeModal";
import type { VideoSubtitleSettings } from "../settings";
import { resolveVideoFile } from "./resolveVideoFile";
import { renderCueOverlay } from "../ui/captionOverlay";
import { toggleOverflowMenu } from "../ui/overflowMenu";
import {
  DEBUG_SHOW_OVERFLOW_HIT,
  hitControlKind,
  measureFullscreenHit,
  measureOverflowHit,
  shouldStealControlClick
} from "../ui/overflowButton";
import {
  currentFullscreenElement,
  exitFullscreen,
  fullscreenMenuParent,
  isPlayerFullscreen,
  requestFullscreen
} from "../ui/fullscreen";
import { pickSubtitleFile } from "../ui/pickSubtitleFile";
import { parseSubtitle } from "../subtitles/parseSubtitle";
import { labelFromFilename, type SubtitleCue } from "../subtitles/cues";
import { newTrackId } from "../subtitles/id";
import {
  emptyStore,
  loadStoreFromVideo,
  saveStoreToVideo,
  type AbsorbedStore,
  type SubtitleTrack
} from "../subtitles/store";
import { toArrayBuffer } from "../subtitles/absorb/bytes";

type VideoSubtitlesHost = Plugin & {
  subtitleSettings: VideoSubtitleSettings;
  saveSettings: () => Promise<void>;
};

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

class VideoSession {
  private store: AbsorbedStore = emptyStore();
  private file: TFile | null = null;
  private idleTimer = 0;
  private creating = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly player: HTMLElement;
  private readonly hitEl: HTMLElement;
  private readonly fsHitEl: HTMLElement;
  private readonly cuesEl: HTMLElement;
  private redirectingFullscreen = false;
  private hovering = false;
  private nativeRequestFullscreen: HTMLVideoElement["requestFullscreen"] | null = null;
  private readonly onTime = (): void => this.paintCues();
  private persistQueue: Promise<void> = Promise.resolve();
  private menu: Menu | null = null;

  constructor(
    private readonly plugin: VideoSubtitlesHost,
    private readonly video: HTMLVideoElement
  ) {
    const parent = video.parentElement;
    if (!parent) throw new Error("video has no host");
    this.player = parent.createDiv({ cls: "video-subtitles-player" });
    parent.insertBefore(this.player, video);
    this.player.appendChild(video);
    this.cuesEl = this.player.createDiv({ cls: "video-subtitles-cues is-empty" });
    this.hitEl = this.player.createDiv({
      cls: "video-subtitles-overflow-hit",
      attr: {
        role: "button",
        "aria-label": "More options"
      }
    });
    this.fsHitEl = this.player.createDiv({
      cls: "video-subtitles-overflow-hit video-subtitles-fullscreen-hit",
      attr: {
        role: "button",
        "aria-label": "Full screen"
      }
    });
    if (DEBUG_SHOW_OVERFLOW_HIT) {
      this.hitEl.addClass("is-debug");
      this.fsHitEl.addClass("is-debug");
    }
    this.bindVideoFullscreen();
    this.syncHitSize();
    this.resizeObserver = new ResizeObserver(() => this.syncHitSize());
    this.resizeObserver.observe(this.video);
    this.video.addEventListener("timeupdate", this.onTime);
    this.video.addEventListener("seeked", this.onTime);
    this.video.addEventListener("loadedmetadata", this.onLoaded);
    this.video.addEventListener("play", this.armHit);
    this.video.addEventListener("pause", this.armHit);
    this.video.addEventListener("dblclick", this.onVideoDblClick, true);
    this.video.addEventListener("pointerdown", this.onVideoHitPointer, true);
    this.video.addEventListener("mousedown", this.onVideoHitPointer, true);
    this.video.addEventListener("click", this.onVideoHitClick, true);
    this.player.addEventListener("mousemove", this.onPlayerMove);
    this.player.addEventListener("mouseleave", this.onPlayerLeave);
    const doc = this.video.ownerDocument;
    doc.addEventListener("fullscreenchange", this.onFullscreenChange);
    doc.addEventListener("webkitfullscreenchange", this.onFullscreenChange);
    this.armHit();
  }

  async bind(): Promise<void> {
    this.file = resolveVideoFile(this.plugin.app, this.video);
    if (!this.file) {
      this.paintCues();
      return;
    }
    try {
      const bytes = new Uint8Array(await this.plugin.app.vault.readBinary(this.file));
      this.store = loadStoreFromVideo(bytes);
    } catch {
      this.store = emptyStore();
    }
    this.paintCues();
  }

  destroy(): void {
    this.menu?.hide();
    this.menu = null;
    this.player.win.clearTimeout(this.idleTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.video.removeEventListener("timeupdate", this.onTime);
    this.video.removeEventListener("seeked", this.onTime);
    this.video.removeEventListener("loadedmetadata", this.onLoaded);
    this.video.removeEventListener("play", this.armHit);
    this.video.removeEventListener("pause", this.armHit);
    this.video.removeEventListener("dblclick", this.onVideoDblClick, true);
    this.video.removeEventListener("pointerdown", this.onVideoHitPointer, true);
    this.video.removeEventListener("mousedown", this.onVideoHitPointer, true);
    this.video.removeEventListener("click", this.onVideoHitClick, true);
    this.player.removeEventListener("mousemove", this.onPlayerMove);
    this.player.removeEventListener("mouseleave", this.onPlayerLeave);
    const doc = this.video.ownerDocument;
    doc.removeEventListener("fullscreenchange", this.onFullscreenChange);
    doc.removeEventListener("webkitfullscreenchange", this.onFullscreenChange);
    this.unbindVideoFullscreen();
    this.hitEl.detach();
    this.fsHitEl.detach();
    this.cuesEl.detach();
    const parent = this.player.parentElement;
    if (parent) parent.insertBefore(this.video, this.player);
    this.player.detach();
  }

  private readonly onLoaded = (): void => {
    this.onTime();
    this.syncHitSize();
  };

  private syncHitSize(): void {
    const box = measureOverflowHit(this.video);
    const fullscreen = measureFullscreenHit(this.video);
    this.player.setCssProps({
      "--video-subtitles-hit-width": `${box.width}px`,
      "--video-subtitles-hit-height": `${box.height}px`,
      "--video-subtitles-hit-right": `${box.right}px`,
      "--video-subtitles-hit-bottom": `${box.bottom}px`,
      "--video-subtitles-fs-width": `${fullscreen.width}px`,
      "--video-subtitles-fs-height": `${fullscreen.height}px`,
      "--video-subtitles-fs-right": `${fullscreen.right}px`,
      "--video-subtitles-fs-bottom": `${fullscreen.bottom}px`
    });
  }

  private setHitsIdle(idle: boolean): void {
    this.hitEl.toggleClass("is-idle", idle);
    this.fsHitEl.toggleClass("is-idle", idle);
  }

  private readonly armHit = (): void => {
    this.setHitsIdle(false);
    const win = this.player.win;
    win.clearTimeout(this.idleTimer);
    if (!this.video.paused) {
      this.idleTimer = win.setTimeout(() => this.setHitsIdle(true), 2500);
    }
  };

  private readonly onPlayerMove = (): void => {
    this.hovering = true;
    this.armHit();
  };

  private readonly onPlayerLeave = (): void => {
    this.hovering = false;
    if (!this.video.paused) this.setHitsIdle(true);
  };

  private controlKind(event: MouseEvent): "overflow" | "fullscreen" | null {
    const rect = this.video.getBoundingClientRect();
    return hitControlKind(
      { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
      event.clientX,
      event.clientY,
      measureOverflowHit(this.video),
      measureFullscreenHit(this.video)
    );
  }

  private stealControlEvent(event: Event, cancelDefault: boolean): "overflow" | "fullscreen" | null {
    if (!(event instanceof MouseEvent)) return null;
    const kind = this.controlKind(event);
    if (!shouldStealControlClick(this.video.paused, this.hovering, kind)) return null;
    if (cancelDefault) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return kind;
  }

  private readonly onVideoHitPointer = (event: Event): void => {
    this.stealControlEvent(event, false);
  };

  private readonly onVideoHitClick = (event: MouseEvent): void => {
    const kind = this.stealControlEvent(event, true);
    if (kind === "overflow") this.openMenu(event);
    if (kind === "fullscreen") void this.togglePlayerFullscreen();
  };

  private bindVideoFullscreen(): void {
    if (typeof this.video.requestFullscreen !== "function") return;
    this.nativeRequestFullscreen = this.video.requestFullscreen.bind(this.video);
    this.video.requestFullscreen = () => requestFullscreen(this.player);
  }

  private unbindVideoFullscreen(): void {
    if (this.nativeRequestFullscreen) {
      this.video.requestFullscreen = this.nativeRequestFullscreen;
      this.nativeRequestFullscreen = null;
    }
  }

  private readonly onFullscreenChange = (): void => {
    const full = currentFullscreenElement(this.video.ownerDocument);
    if (full === this.video) {
      void this.promoteFullscreenToPlayer();
      return;
    }
    this.syncHitSize();
    this.armHit();
  };

  private readonly onVideoDblClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    void this.togglePlayerFullscreen();
  };

  private async togglePlayerFullscreen(): Promise<void> {
    const doc = this.video.ownerDocument;
    try {
      if (isPlayerFullscreen(doc, this.player)) await exitFullscreen(doc);
      else await requestFullscreen(this.player);
    } catch (error) {
      console.error(formatError(error));
    }
    this.syncHitSize();
  }

  private async promoteFullscreenToPlayer(): Promise<void> {
    if (this.redirectingFullscreen) return;
    const doc = this.video.ownerDocument;
    this.redirectingFullscreen = true;
    try {
      if (currentFullscreenElement(doc) === this.video) await exitFullscreen(doc);
      if (currentFullscreenElement(doc) !== this.player) await requestFullscreen(this.player);
    } catch (error) {
      console.error(formatError(error));
    } finally {
      this.redirectingFullscreen = false;
      this.syncHitSize();
      this.armHit();
    }
  }

  private openMenu(event: MouseEvent): void {
    const menu = toggleOverflowMenu(this.menu, {
      event,
      tracks: this.store.tracks,
      activeTrackId: this.store.activeTrackId,
      playbackRate: this.video.playbackRate,
      parent: fullscreenMenuParent(this.video.ownerDocument, this.player),
      onDownload: () => {
        void this.downloadVideo();
      },
      onRate: (rate) => {
        this.video.playbackRate = rate;
      },
      onPip: () => {
        const doc = this.video.ownerDocument;
        if (this.video !== doc.pictureInPictureElement) {
          void this.video.requestPictureInPicture?.();
        } else {
          void doc.exitPictureInPicture?.();
        }
      },
      onOff: () => {
        this.store = { ...this.store, activeTrackId: null };
        this.paintCues();
        if (this.store.tracks.length > 0) void this.persist();
      },
      onSelectTrack: (id) => {
        this.store = { ...this.store, activeTrackId: id };
        this.paintCues();
        void this.persist();
      },
      onCreate: () => {
        void this.createTrack();
      },
      onImport: () => {
        void this.importTrack();
      }
    });
    this.menu = menu;
    menu?.onHide(() => {
      if (this.menu === menu) this.menu = null;
    });
  }

  private async downloadVideo(): Promise<void> {
    this.file = resolveVideoFile(this.plugin.app, this.video) ?? this.file;
    if (!(this.file instanceof TFile)) {
      new Notice("Open the video file to download it.");
      return;
    }
    const file = this.file;
    try {
      const data = await this.plugin.app.vault.readBinary(file);
      const url = URL.createObjectURL(new Blob([data]));
      const link = this.video.ownerDocument.body.createEl("a", {
        attr: { href: url, download: file.name }
      });
      link.click();
      link.detach();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(formatError(error));
      new Notice("Could not download the video.");
    }
  }

  private async importTrack(): Promise<void> {
    const picked = await pickSubtitleFile(this.video.ownerDocument);
    if (!picked) return;
    const parsed = parseSubtitle(picked.text, picked.name);
    if (parsed.cues.length === 0) {
      new Notice("That file has no subtitle cues.");
      return;
    }
    const track: SubtitleTrack = {
      id: newTrackId(),
      label: labelFromFilename(picked.name),
      language: "",
      cues: parsed.cues
    };
    this.store = {
      version: this.store.version,
      tracks: [...this.store.tracks, track],
      activeTrackId: track.id
    };
    this.paintCues();
    const saved = await this.persist();
    if (saved) {
      new Notice(`Imported ${track.label} into the video.`);
    }
  }

  private async createTrack(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice("Creating subtitles needs desktop Obsidian.");
      return;
    }
    if (this.creating) {
      new Notice("Already creating subtitles for this video.");
      return;
    }
    this.file = resolveVideoFile(this.plugin.app, this.video) ?? this.file;
    if (!(this.file instanceof TFile)) {
      new Notice("Open the video file to create subtitles.");
      return;
    }
    const file = this.file;
    let range: TranscribeRange | null = null;
    if (this.plugin.subtitleSettings.chooseCreateRange) {
      const duration = videoDurationSec(this.video.duration);
      if (duration == null) {
        new Notice("Wait for the video to load, then create again.");
        return;
      }
      range = await promptCreateRange(this.plugin.app, duration, () => this.video.currentTime);
      if (!range) return;
    }
    if (!this.plugin.subtitleSettings.accuracyInitialized) {
      try {
        this.plugin.subtitleSettings.transcriberAccuracy = pickAccuracyForHardware(readHardware());
        this.plugin.subtitleSettings.accuracyInitialized = true;
        await this.plugin.saveSettings();
      } catch (error) {
        console.error(error);
      }
    }
    const keep = this.plugin.subtitleSettings.keepTranscriber;
    const win = this.video.ownerDocument.defaultView;
    if (!win) {
      new Notice("Could not create subtitles.");
      return;
    }
    this.creating = true;
    const status = showCreateProgressNotice();
    let root = "";
    try {
      root = transcriberRoot(this.plugin);
      const cues = await transcribeVideoFile(
        this.plugin,
        vaultFileAbsPath(this.plugin, file),
        this.plugin.subtitleSettings,
        win,
        status.setPercent,
        async (partial) => {
          await this.applyGeneratedCues(partial, false, range);
        },
        range
      );
      if (cues.length === 0) {
        status.hide();
        clearCreateResume(this.plugin);
        new Notice("The transcriber returned no speech.");
        return;
      }
      status.setPercent(100, null, "work");
      const saved = await this.applyGeneratedCues(cues, true, range);
      status.hide();
      if (saved) {
        clearCreateResume(this.plugin);
        new Notice("Added generated subtitles to the video.");
      }
    } catch (error) {
      console.error(formatError(error));
      status.hide();
      if (this.hasGeneratedCues()) {
        new Notice("Saved generated subtitles so far. Create again to continue.");
      } else {
        const message = error instanceof Error && error.message ? error.message : "Could not create subtitles.";
        new Notice(message);
      }
    } finally {
      this.creating = false;
      try {
        await this.persistQueue;
      } catch {
        /* keep going */
      }
      if (root) {
        try {
          cleanupTranscriber(root, keep);
        } catch (error) {
          console.error(formatError(error));
        }
      }
    }
  }

  private activeTrack(): SubtitleTrack | null {
    const id = this.store.activeTrackId;
    return this.store.tracks.find((track) => track.id === id) ?? null;
  }

  private paintCues(): void {
    if (!this.cuesEl.isConnected) return;
    const track = this.activeTrack();
    renderCueOverlay(this.cuesEl, track?.cues ?? [], this.video.currentTime);
  }

  private hasGeneratedCues(): boolean {
    return this.store.tracks.some((track) => isGeneratedTrack(track) && track.cues.length > 0);
  }

  private async applyGeneratedCues(
    cues: readonly SubtitleCue[],
    reload: boolean,
    range: TranscribeRange | null = null
  ): Promise<boolean> {
    if (cues.length === 0) return false;
    this.store = range
      ? spliceGeneratedTrack(this.store, cues, range)
      : upsertGeneratedTrack(this.store, cues);
    this.paintCues();
    return this.persist(reload);
  }

  private persist(reload = true): Promise<boolean> {
    const run = this.persistQueue.then(() => this.writeStore(reload));
    this.persistQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async writeStore(reload: boolean): Promise<boolean> {
    this.file = resolveVideoFile(this.plugin.app, this.video) ?? this.file;
    if (!(this.file instanceof TFile)) {
      if (reload) new Notice("Imported for this session. Open the video file to store subtitles inside it.");
      return false;
    }
    const file = this.file;
    const original = new Uint8Array(await this.plugin.app.vault.readBinary(file));
    try {
      const next = saveStoreToVideo(original, this.store);
      await this.plugin.app.vault.modifyBinary(file, toArrayBuffer(next));
      if (reload) this.reloadSrc(file);
      return true;
    } catch (error) {
      try {
        await this.plugin.app.vault.modifyBinary(file, toArrayBuffer(original));
      } catch {
        // Keep going; playback still has the in-memory track.
      }
      console.error(formatError(error));
      if (reload) new Notice("Could not store subtitles inside the video. The track still works until you close it.");
      return false;
    }
  }

  private reloadSrc(file: TFile): void {
    const time = this.video.currentTime;
    const paused = this.video.paused;
    const rate = this.video.playbackRate;
    const resume = (): void => {
      this.video.currentTime = time;
      this.video.playbackRate = rate;
      if (!paused) void this.video.play();
      this.video.removeEventListener("loadedmetadata", resume);
      this.paintCues();
    };
    this.video.addEventListener("loadedmetadata", resume);
    this.video.src = this.plugin.app.vault.getResourcePath(file);
  }
}

export class VideoSurfaceManager {
  private readonly sessions = new Map<HTMLVideoElement, VideoSession>();
  private readonly watchedDocs = new Set<Document>();
  private observer: MutationObserver | null = null;
  private scanTimer = 0;

  constructor(private readonly plugin: VideoSubtitlesHost) {}

  start(): void {
    const workspace = this.plugin.app.workspace;
    this.observer = new MutationObserver(() => this.scheduleScan());
    this.plugin.register(() => this.dispose());
    this.plugin.registerEvent(workspace.on("layout-change", () => this.scan()));
    this.plugin.registerEvent(workspace.on("file-open", () => this.scheduleScan()));
    this.plugin.registerEvent(workspace.on("window-open", () => this.scan()));
    this.scan();
  }

  private scheduleScan(): void {
    const win = this.plugin.app.workspace.containerEl.win;
    win.clearTimeout(this.scanTimer);
    this.scanTimer = win.setTimeout(() => this.scan(), 50);
  }

  private workspaceVideos(): HTMLVideoElement[] {
    const videos: HTMLVideoElement[] = [];
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      videos.push(...Array.from(leaf.view.containerEl.querySelectorAll("video")));
    });
    return videos;
  }

  private watchDocuments(): void {
    if (!this.observer) return;
    const docs = new Set<Document>();
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      docs.add(leaf.view.containerEl.ownerDocument);
    });
    for (const doc of docs) {
      if (this.watchedDocs.has(doc) || !doc.body) continue;
      this.observer.observe(doc.body, { childList: true, subtree: true });
      this.watchedDocs.add(doc);
    }
  }

  private scan(): void {
    this.watchDocuments();
    const videos = this.workspaceVideos();
    const seen = new Set(videos);
    for (const [video, session] of this.sessions) {
      if (seen.has(video) && video.isConnected) continue;
      session.destroy();
      this.sessions.delete(video);
    }
    for (const video of videos) {
      if (this.sessions.has(video) || !video.isConnected || !video.parentElement) continue;
      try {
        const session = new VideoSession(this.plugin, video);
        this.sessions.set(video, session);
        void session.bind();
      } catch (error) {
        console.error(formatError(error));
      }
    }
  }

  private dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.watchedDocs.clear();
    const win = this.plugin.app.workspace.containerEl.win;
    win.clearTimeout(this.scanTimer);
    for (const session of this.sessions.values()) session.destroy();
    this.sessions.clear();
  }
}
