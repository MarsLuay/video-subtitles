import { Component, Menu, Notice, Platform, TFile } from "obsidian";
import type { VideoSubtitlesHost } from "../pluginHost";
import { spliceGeneratedTrack, upsertGeneratedTrack } from "../subtitles/generatedTrack";
import { writeGeneratedCues } from "../subtitles/writeGenerated";
import { pickAccuracyForHardware } from "../transcribe/hardware";
import { readHardware } from "../transcribe/node";
import { videoDurationSec, type TranscribeRange } from "../transcribe/range";
import { promptCreateRange } from "../ui/createRangeModal";
import { resolveVideoFile } from "./resolveVideoFile";
import { applyCueAppearance, renderCueOverlay } from "../ui/captionOverlay";
import { toggleOverflowMenu } from "../ui/overflowMenu";
import {
  DEBUG_SHOW_OVERFLOW_HIT,
  hitControlKind,
  measureFullscreenHit,
  measureOverflowHit,
  overlayOffset,
  shouldStealControlClick
} from "../ui/overflowButton";
import {
  currentFullscreenElement,
  exitFullscreen,
  fullscreenMenuParent,
  isPlayerFullscreen,
  requestFullscreen,
  videoFullscreenRedirect
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

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

class VideoSession extends Component {
  private store: AbsorbedStore = emptyStore();
  private file: TFile | null = null;
  private idleTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly player: HTMLElement;
  private readonly hitEl: HTMLElement;
  private readonly fsHitEl: HTMLElement;
  private readonly cuesEl: HTMLElement;
  private redirectingFullscreen = false;
  private hovering = false;
  private fullscreenWork: Promise<void> | null = null;
  private nativeRequestFullscreen: HTMLVideoElement["requestFullscreen"] | null = null;
  private nativeWebkitRequestFullscreen: (() => void) | null = null;
  private readonly onTime = (): void => this.paintCues();
  private persistQueue: Promise<void> = Promise.resolve();
  private menu: Menu | null = null;

  constructor(
    private readonly plugin: VideoSubtitlesHost,
    private readonly video: HTMLVideoElement
  ) {
    super();
    const parent = video.parentElement;
    if (!parent) throw new Error("video has no host");
    this.plugin.addChild(this);
    this.player = parent.createDiv({ cls: "video-subtitles-player" });
    parent.insertBefore(this.player, video);
    this.player.appendChild(video);
    this.cuesEl = this.player.createDiv({ cls: "video-subtitles-cues is-empty" });
    this.paintCueStyle();
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
    this.resizeObserver.observe(this.player);
    const win = this.player.win;
    win.requestAnimationFrame(() => {
      this.syncHitSize();
      win.requestAnimationFrame(() => this.syncHitSize());
    });
    win.setTimeout(() => this.syncHitSize(), 0);
    this.registerDomEvent(this.video, "timeupdate", this.onTime);
    this.registerDomEvent(this.video, "seeked", this.onTime);
    this.registerDomEvent(this.video, "loadedmetadata", this.onLoaded);
    this.registerDomEvent(this.video, "play", this.armHit);
    this.registerDomEvent(this.video, "pause", this.armHit);
    this.registerDomEvent(this.video, "dblclick", this.onVideoDblClick, true);
    this.registerDomEvent(this.video, "pointerdown", this.onVideoHitPointer, true);
    this.registerDomEvent(this.video, "mousedown", this.onVideoHitPointer, true);
    this.registerDomEvent(this.video, "pointermove", this.onPlayerMove);
    this.registerDomEvent(this.video, "click", this.onVideoHitClick, true);
    this.bindHit(this.hitEl, this.onHitClick);
    this.bindHit(this.fsHitEl, this.onFullscreenHitClick);
    this.registerDomEvent(this.player, "mousemove", this.onPlayerMove);
    this.registerDomEvent(this.player, "mouseleave", this.onPlayerLeave);
    const doc = this.video.ownerDocument;
    this.registerDomEvent(doc, "pointerdown", this.onFullscreenDocPointer, true);
    this.registerDomEvent(doc, "mousedown", this.onFullscreenDocPointer, true);
    this.registerDomEvent(doc, "click", this.onFullscreenDocClick, true);
    this.registerDomEvent(doc, "fullscreenchange", this.onFullscreenChange);
    this.registerDomEvent(doc, "webkitfullscreenchange" as "fullscreenchange", this.onFullscreenChange);
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
    this.unbindVideoFullscreen();
    this.plugin.removeChild(this);
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
    const playerRect = this.player.getBoundingClientRect();
    const videoRect = this.video.getBoundingClientRect();
    if (videoRect.width <= 0 || videoRect.height <= 0) return;
    const box = measureOverflowHit(this.video);
    const fullscreen = measureFullscreenHit(this.video);
    const overflowPos = overlayOffset(playerRect, videoRect, box);
    const fullscreenPos = overlayOffset(playerRect, videoRect, fullscreen);
    this.player.setCssProps({
      "--video-subtitles-hit-width": `${box.width}px`,
      "--video-subtitles-hit-height": `${box.height}px`,
      "--video-subtitles-hit-left": `${overflowPos.left}px`,
      "--video-subtitles-hit-top": `${overflowPos.top}px`,
      "--video-subtitles-fs-width": `${fullscreen.width}px`,
      "--video-subtitles-fs-height": `${fullscreen.height}px`,
      "--video-subtitles-fs-left": `${fullscreenPos.left}px`,
      "--video-subtitles-fs-top": `${fullscreenPos.top}px`
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

  private readonly onPlayerLeave = (event: MouseEvent): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && this.player.contains(next)) return;
    if (isPlayerFullscreen(this.video.ownerDocument, this.player) && !(next instanceof Node)) return;
    this.hovering = false;
    if (!this.video.paused) this.setHitsIdle(true);
  };

  private isHitTarget(event: Event): boolean {
    return event.target === this.hitEl || event.target === this.fsHitEl;
  }

  private shouldStealFrom(event: Event): boolean {
    if (this.isHitTarget(event)) return false;
    const target = event.target;
    if (!target || typeof (target as Element).closest !== "function") return true;
    return !(target as Element).closest(".menu");
  }

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
    const mouse = event as MouseEvent;
    if (typeof mouse.clientX !== "number" || typeof mouse.clientY !== "number") return null;
    const kind = this.controlKind(mouse);
    if (!shouldStealControlClick(this.video.paused, this.hovering, kind)) return null;
    if (cancelDefault) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return kind;
  }

  private readonly onVideoHitPointer = (event: MouseEvent): void => {
    this.hovering = true;
    this.armHit();
    if (!this.shouldStealFrom(event)) return;
    this.stealControlEvent(event, false);
  };

  private readonly onVideoHitClick = (event: MouseEvent): void => {
    if (!this.shouldStealFrom(event)) return;
    const kind = this.stealControlEvent(event, true);
    if (kind === "overflow") this.openMenu(event);
    if (kind === "fullscreen") void this.togglePlayerFullscreen();
  };

  private readonly onFullscreenDocPointer = (event: MouseEvent): void => {
    if (!isPlayerFullscreen(this.video.ownerDocument, this.player)) return;
    this.onVideoHitPointer(event);
  };

  private readonly onFullscreenDocClick = (event: MouseEvent): void => {
    if (!isPlayerFullscreen(this.video.ownerDocument, this.player)) return;
    this.onVideoHitClick(event);
  };

  private bindHit(el: HTMLElement, onClick: (event: MouseEvent) => void): void {
    this.registerDomEvent(el, "pointerdown", this.onHitPointer);
    this.registerDomEvent(el, "mousedown", this.onHitPointer);
    this.registerDomEvent(el, "click", onClick);
  }

  private readonly onHitPointer = (event: MouseEvent): void => {
    event.stopPropagation();
  };

  private readonly onHitClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.openMenu(event);
  };

  private readonly onFullscreenHitClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    void this.togglePlayerFullscreen();
  };

  private bindVideoFullscreen(): void {
    const video = this.video as HTMLVideoElement & {
      webkitRequestFullscreen?: () => void;
    };
    const redirect = (): Promise<void> => this.togglePlayerFullscreen();
    if (typeof video.requestFullscreen === "function") {
      this.nativeRequestFullscreen = video.requestFullscreen.bind(video);
      video.requestFullscreen = () => redirect();
    }
    if (typeof video.webkitRequestFullscreen === "function") {
      this.nativeWebkitRequestFullscreen = video.webkitRequestFullscreen.bind(video);
      video.webkitRequestFullscreen = () => {
        void redirect();
      };
    }
  }

  private unbindVideoFullscreen(): void {
    if (this.nativeRequestFullscreen) {
      this.video.requestFullscreen = this.nativeRequestFullscreen;
      this.nativeRequestFullscreen = null;
    }
    const video = this.video as HTMLVideoElement & {
      webkitRequestFullscreen?: () => void;
    };
    if (this.nativeWebkitRequestFullscreen) {
      video.webkitRequestFullscreen = this.nativeWebkitRequestFullscreen;
      this.nativeWebkitRequestFullscreen = null;
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

  private togglePlayerFullscreen(): Promise<void> {
    if (this.fullscreenWork) return this.fullscreenWork;
    this.fullscreenWork = this.runTogglePlayerFullscreen().finally(() => {
      this.fullscreenWork = null;
    });
    return this.fullscreenWork;
  }

  private async runTogglePlayerFullscreen(): Promise<void> {
    const doc = this.video.ownerDocument;
    try {
      if (videoFullscreenRedirect(isPlayerFullscreen(doc, this.player)) === "exit") {
        await exitFullscreen(doc);
      } else {
        await requestFullscreen(this.player);
      }
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
    this.file = resolveVideoFile(this.plugin.app, this.video) ?? this.file;
    if (!(this.file instanceof TFile)) {
      new Notice("Open the video file to create subtitles.");
      return;
    }
    const file = this.file;
    if (this.plugin.createQueue.running) {
      const kind = this.plugin.createQueue.prioritize(file);
      if (kind === "current") new Notice("Already creating subtitles for this video.");
      else if (kind === "moved") new Notice("Moved this video to the front of the queue.");
      else new Notice("Queued this video next.");
      return;
    }
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
    this.plugin.createQueue.prioritize(file, range);
  }

  private activeTrack(): SubtitleTrack | null {
    const id = this.store.activeTrackId;
    return this.store.tracks.find((track) => track.id === id) ?? null;
  }

  paintCueStyle(): void {
    if (!this.cuesEl.isConnected) return;
    applyCueAppearance(this.cuesEl, this.plugin.subtitleSettings);
  }

  private paintCues(): void {
    if (!this.cuesEl.isConnected) return;
    this.paintCueStyle();
    const track = this.activeTrack();
    renderCueOverlay(this.cuesEl, track?.cues ?? [], this.video.currentTime);
  }

  ownsFile(file: TFile): boolean {
    this.file = resolveVideoFile(this.plugin.app, this.video) ?? this.file;
    return this.file?.path === file.path;
  }

  async applyGeneratedCues(
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
      this.paintCues();
    };
    this.registerDomEvent(this.video, "loadedmetadata", resume, { once: true });
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
    const videos = new Set<HTMLVideoElement>();
    const docs = new Set<Document>();
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      docs.add(leaf.view.containerEl.ownerDocument);
      for (const video of leaf.view.containerEl.querySelectorAll("video")) {
        videos.add(video);
      }
    });
    for (const doc of docs) {
      const full = currentFullscreenElement(doc);
      if (!full) continue;
      if (full.tagName === "VIDEO") videos.add(full as HTMLVideoElement);
      else {
        for (const video of full.querySelectorAll("video")) videos.add(video);
      }
    }
    return [...videos];
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

  applyCueAppearance(): void {
    for (const session of this.sessions.values()) session.paintCueStyle();
  }

  applyGenerated(
    file: TFile,
    cues: readonly SubtitleCue[],
    reload: boolean,
    range: TranscribeRange | null
  ): Promise<boolean> {
    for (const session of this.sessions.values()) {
      if (session.ownsFile(file)) return session.applyGeneratedCues(cues, reload, range);
    }
    return writeGeneratedCues(this.plugin, file, cues, range);
  }
}
