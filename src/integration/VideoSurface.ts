import { Notice, TFile, type App, type Plugin } from "obsidian";
import { resolveVideoFile } from "./resolveVideoFile";
import { renderCueOverlay } from "../ui/captionOverlay";
import { openOverflowMenu } from "../ui/overflowMenu";
import { isOverflowButtonHit, overflowControlsVisible } from "../ui/overflowButton";
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

class VideoSession {
  private store: AbsorbedStore = emptyStore();
  private file: TFile | null = null;
  private hovering = false;
  private readonly host: HTMLElement;
  private readonly cuesEl: HTMLElement;
  private readonly onTime = (): void => this.paintCues();
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly app: App,
    private readonly video: HTMLVideoElement
  ) {
    const parent = video.parentElement;
    if (!parent) throw new Error("video has no host");
    this.host = parent;
    this.host.addClass("video-subtitles-host");
    this.cuesEl = this.host.createDiv({ cls: "video-subtitles-cues is-empty" });
    this.video.addEventListener("timeupdate", this.onTime);
    this.video.addEventListener("seeked", this.onTime);
    this.video.addEventListener("loadedmetadata", this.onTime);
    this.video.addEventListener("mouseenter", this.onMouseEnter);
    this.video.addEventListener("mouseleave", this.onMouseLeave);
    this.video.addEventListener("pointerdown", this.onOverflowPointer, true);
    this.video.addEventListener("mousedown", this.onOverflowPointer, true);
    this.video.addEventListener("click", this.onOverflowPointer, true);
  }

  async bind(): Promise<void> {
    this.file = resolveVideoFile(this.app, this.video);
    if (!this.file) {
      this.paintCues();
      return;
    }
    try {
      const bytes = new Uint8Array(await this.app.vault.readBinary(this.file));
      this.store = loadStoreFromVideo(bytes);
    } catch {
      this.store = emptyStore();
    }
    this.paintCues();
  }

  destroy(): void {
    this.video.removeEventListener("timeupdate", this.onTime);
    this.video.removeEventListener("seeked", this.onTime);
    this.video.removeEventListener("loadedmetadata", this.onTime);
    this.video.removeEventListener("mouseenter", this.onMouseEnter);
    this.video.removeEventListener("mouseleave", this.onMouseLeave);
    this.video.removeEventListener("pointerdown", this.onOverflowPointer, true);
    this.video.removeEventListener("mousedown", this.onOverflowPointer, true);
    this.video.removeEventListener("click", this.onOverflowPointer, true);
    this.cuesEl.detach();
    this.host.removeClass("video-subtitles-host");
  }

  private readonly onMouseEnter = (): void => {
    this.hovering = true;
  };

  private readonly onMouseLeave = (): void => {
    this.hovering = false;
  };

  private readonly onOverflowPointer = (event: Event): void => {
    if (!(event instanceof MouseEvent) || event.button !== 0) return;
    if (!overflowControlsVisible(this.video.paused, this.hovering)) return;
    if (!isOverflowButtonHit(this.video.getBoundingClientRect(), event.clientX, event.clientY)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") this.openMenu(event);
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
      onImport: () => {
        void this.importTrack();
      }
    });
  }

  private async downloadVideo(): Promise<void> {
    this.file = resolveVideoFile(this.app, this.video) ?? this.file;
    if (!(this.file instanceof TFile)) {
      new Notice("Open the video file to download it.");
      return;
    }
    const file = this.file;
    try {
      const data = await this.app.vault.readBinary(file);
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
    this.file = resolveVideoFile(this.app, this.video) ?? this.file;
    if (!(this.file instanceof TFile)) {
      new Notice("Imported for this session. Open the video file to store subtitles inside it.");
      return false;
    }
    const file = this.file;
    const original = new Uint8Array(await this.app.vault.readBinary(file));
    try {
      const next = saveStoreToVideo(original, this.store);
      await this.app.vault.modifyBinary(file, toArrayBuffer(next));
      this.reloadSrc(file);
      return true;
    } catch (error) {
      try {
        await this.app.vault.modifyBinary(file, toArrayBuffer(original));
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
    this.video.src = this.app.vault.getResourcePath(file);
  }
}

export class VideoSurfaceManager {
  private readonly sessions = new Map<HTMLVideoElement, VideoSession>();
  private observer: MutationObserver | null = null;
  private scanTimer = 0;

  constructor(private readonly plugin: Plugin) {}

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
        const session = new VideoSession(this.plugin.app, video);
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
