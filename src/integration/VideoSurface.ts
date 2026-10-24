import { Notice, Platform, TFile, type Plugin } from "obsidian";
import { upsertGeneratedTrack } from "../subtitles/generatedTrack";
import { cleanupTranscriber, transcriberRoot, transcribeVideoFile, vaultFileAbsPath } from "../transcribe/runtime";
import { pickAccuracyForHardware } from "../transcribe/hardware";
import { readHardware } from "../transcribe/node";
import type { VideoSubtitleSettings } from "../settings";
import { resolveVideoFile } from "./resolveVideoFile";
import { renderCueOverlay } from "../ui/captionOverlay";
import { openOverflowMenu } from "../ui/overflowMenu";
import { DEBUG_SHOW_OVERFLOW_HIT, measureOverflowHit } from "../ui/overflowButton";
import { pickSubtitleFile } from "../ui/pickSubtitleFile";
import { parseSubtitle } from "../subtitles/parseSubtitle";
import { labelFromFilename } from "../subtitles/cues";
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

class VideoSession {
  private store: AbsorbedStore = emptyStore();
  private file: TFile | null = null;
  private idleTimer = 0;
  private creating = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly player: HTMLElement;
  private readonly hitEl: HTMLElement;
  private readonly cuesEl: HTMLElement;
  private readonly onTime = (): void => this.paintCues();
  private persistQueue: Promise<void> = Promise.resolve();

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
    if (DEBUG_SHOW_OVERFLOW_HIT) this.hitEl.addClass("is-debug");
    this.syncHitSize();
    this.resizeObserver = new ResizeObserver(() => this.syncHitSize());
    this.resizeObserver.observe(this.video);
    this.video.addEventListener("timeupdate", this.onTime);
    this.video.addEventListener("seeked", this.onTime);
    this.video.addEventListener("loadedmetadata", this.onLoaded);
    this.video.addEventListener("play", this.armHit);
    this.video.addEventListener("pause", this.armHit);
    this.player.addEventListener("mousemove", this.armHit);
    this.player.addEventListener("mouseleave", this.onPlayerLeave);
    this.hitEl.addEventListener("pointerdown", this.onHitPointer);
    this.hitEl.addEventListener("mousedown", this.onHitPointer);
    this.hitEl.addEventListener("click", this.onHitClick);
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
    this.player.win.clearTimeout(this.idleTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.video.removeEventListener("timeupdate", this.onTime);
    this.video.removeEventListener("seeked", this.onTime);
    this.video.removeEventListener("loadedmetadata", this.onLoaded);
    this.video.removeEventListener("play", this.armHit);
    this.video.removeEventListener("pause", this.armHit);
    this.player.removeEventListener("mousemove", this.armHit);
    this.player.removeEventListener("mouseleave", this.onPlayerLeave);
    this.hitEl.removeEventListener("pointerdown", this.onHitPointer);
    this.hitEl.removeEventListener("mousedown", this.onHitPointer);
    this.hitEl.removeEventListener("click", this.onHitClick);
    this.hitEl.detach();
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
    this.player.setCssProps({
      "--video-subtitles-hit-width": `${box.width}px`,
      "--video-subtitles-hit-height": `${box.height}px`,
      "--video-subtitles-hit-right": `${box.right}px`,
      "--video-subtitles-hit-bottom": `${box.bottom}px`
    });
  }

  private readonly armHit = (): void => {
    this.hitEl.removeClass("is-idle");
    const win = this.player.win;
    win.clearTimeout(this.idleTimer);
    if (!this.video.paused) {
      this.idleTimer = win.setTimeout(() => this.hitEl.addClass("is-idle"), 2500);
    }
  };

  private readonly onPlayerLeave = (): void => {
    if (!this.video.paused) this.hitEl.addClass("is-idle");
  };

  private readonly onHitPointer = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly onHitClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.openMenu(event);
  };

  private openMenu(event: MouseEvent): void {
    openOverflowMenu({
      event,
      tracks: this.store.tracks,
      activeTrackId: this.store.activeTrackId,
      playbackRate: this.video.playbackRate,
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
      console.error(error);
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
    const status = new Notice("Creating subtitles…", 0);
    let root = "";
    try {
      root = transcriberRoot(this.plugin);
      const cues = await transcribeVideoFile(
        this.plugin,
        vaultFileAbsPath(this.plugin, file),
        this.plugin.subtitleSettings.transcriberAccuracy,
        win
      );
      if (cues.length === 0) {
        status.hide();
        new Notice("The transcriber returned no speech.");
        return;
      }
      this.store = upsertGeneratedTrack(this.store, cues);
      this.paintCues();
      const saved = await this.persist();
      status.hide();
      if (saved) new Notice("Added generated subtitles to the video.");
    } catch (error) {
      console.error(error);
      status.hide();
      new Notice(error instanceof Error ? error.message : "Could not create subtitles.");
    } finally {
      this.creating = false;
      if (root) {
        try {
          cleanupTranscriber(root, keep);
        } catch (error) {
          console.error(error);
        }
      }
    }
  }

  private activeTrack(): SubtitleTrack | null {
    const id = this.store.activeTrackId;
    return this.store.tracks.find((track) => track.id === id) ?? null;
  }

  private paintCues(): void {
    const track = this.activeTrack();
    renderCueOverlay(this.cuesEl, track?.cues ?? [], this.video.currentTime);
  }

  private persist(): Promise<boolean> {
    const run = this.persistQueue.then(() => this.writeStore());
    this.persistQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async writeStore(): Promise<boolean> {
    this.file = resolveVideoFile(this.plugin.app, this.video) ?? this.file;
    if (!(this.file instanceof TFile)) {
      new Notice("Imported for this session. Open the video file to store subtitles inside it.");
      return false;
    }
    const file = this.file;
      const original = new Uint8Array(await this.plugin.app.vault.readBinary(file));
    try {
      const next = saveStoreToVideo(original, this.store);
      await this.plugin.app.vault.modifyBinary(file, toArrayBuffer(next));
      this.reloadSrc(file);
      return true;
    } catch (error) {
      try {
        await this.plugin.app.vault.modifyBinary(file, toArrayBuffer(original));
      } catch {
        // Keep going; playback still has the in-memory track.
      }
      console.error(error);
      new Notice("Could not store subtitles inside the video. The track still works until you close it.");
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
  private observer: MutationObserver | null = null;
  private scanTimer = 0;

  constructor(private readonly plugin: VideoSubtitlesHost) {}

  start(): void {
    const workspace = this.plugin.app.workspace;
    this.observer = new MutationObserver(() => this.scheduleScan());
    this.observer.observe(workspace.containerEl, { childList: true, subtree: true });
    this.plugin.register(() => this.dispose());
    this.plugin.registerEvent(workspace.on("layout-change", () => this.scheduleScan()));
    this.plugin.registerEvent(workspace.on("file-open", () => this.scheduleScan()));
    this.scan();
  }

  private scheduleScan(): void {
    const win = this.plugin.app.workspace.containerEl.win;
    win.clearTimeout(this.scanTimer);
    this.scanTimer = win.setTimeout(() => this.scan(), 50);
  }

  private scan(): void {
    const root = this.plugin.app.workspace.containerEl;
    const videos = Array.from(root.querySelectorAll("video"));
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
        console.error(error);
      }
    }
  }

  private dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    const win = this.plugin.app.workspace.containerEl.win;
    win.clearTimeout(this.scanTimer);
    for (const session of this.sessions.values()) session.destroy();
    this.sessions.clear();
  }
}
