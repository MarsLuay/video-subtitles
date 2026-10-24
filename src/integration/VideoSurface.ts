import { Menu, Notice, TFile, type App, type Plugin, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { resolveVideoFile } from "./resolveVideoFile";
import { renderCueOverlay } from "../ui/captionOverlay";
import { addSubtitleMenuItems } from "../ui/overflowMenu";
import { isNativeSubtitleMenu } from "../ui/menuModel";
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
import { isVideoExtension } from "../videoFileTypes";

class VideoSession {
  private store: AbsorbedStore = emptyStore();
  private file: TFile | null = null;
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
  }

  get filePath(): string | null {
    return this.file?.path ?? null;
  }

  menuState(): { tracks: SubtitleTrack[]; activeTrackId: string | null } {
    return { tracks: this.store.tracks, activeTrackId: this.store.activeTrackId };
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
    this.cuesEl.detach();
    this.host.removeClass("video-subtitles-host");
  }

  ownerDocument(): Document {
    return this.video.ownerDocument;
  }

  setOff(): void {
    this.store = { ...this.store, activeTrackId: null };
    this.paintCues();
    if (this.store.tracks.length > 0) void this.persist();
  }

  selectTrack(id: string): void {
    this.store = { ...this.store, activeTrackId: id };
    this.paintCues();
    void this.persist();
  }

  async importTrack(): Promise<void> {
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
    this.plugin.registerEvent(workspace.on("file-menu", (menu, file, source, leaf) => {
      this.populateNativeMenu(menu, file, source, leaf);
    }));
    this.scan();
  }

  populateNativeMenu(menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf): void {
    if (!isNativeSubtitleMenu(source)) return;
    if (!(file instanceof TFile) || !isVideoExtension(file.extension)) return;
    const session = this.sessionForFile(file) ?? this.sessionForLeaf(leaf);
    const state = session?.menuState() ?? { tracks: [], activeTrackId: null };
    addSubtitleMenuItems(menu, {
      tracks: state.tracks,
      activeTrackId: state.activeTrackId,
      onOff: () => session?.setOff(),
      onSelectTrack: (id) => session?.selectTrack(id),
      onImport: () => {
        void this.importFromMenu(file, session, leaf);
      }
    });
  }

  private sessionForFile(file: TFile): VideoSession | null {
    for (const session of this.sessions.values()) {
      if (session.filePath === file.path) return session;
    }
    return null;
  }

  private sessionForLeaf(leaf?: WorkspaceLeaf): VideoSession | null {
    const video = leaf?.view.containerEl.querySelector("video");
    return video ? this.sessions.get(video) ?? null : null;
  }

  private async importFromMenu(file: TFile, session: VideoSession | null, leaf?: WorkspaceLeaf): Promise<void> {
    if (session) {
      await session.importTrack();
      return;
    }
    const doc = leaf?.view.containerEl.doc ?? this.plugin.app.workspace.containerEl.doc;
    const picked = await pickSubtitleFile(doc);
    if (!picked) return;
    const parsed = parseSubtitle(picked.text, picked.name);
    if (parsed.cues.length === 0) {
      new Notice("That file has no subtitle cues.");
      return;
    }
    const original = new Uint8Array(await this.plugin.app.vault.readBinary(file));
    const store = loadStoreFromVideo(original);
    store.tracks.push({
      id: newTrackId(),
      label: labelFromFilename(picked.name),
      language: "",
      cues: parsed.cues
    });
    const added = store.tracks[store.tracks.length - 1];
    if (added) store.activeTrackId = added.id;
    try {
      await this.plugin.app.vault.modifyBinary(file, toArrayBuffer(saveStoreToVideo(original, store)));
      new Notice(`Imported ${labelFromFilename(picked.name)} into the video.`);
    } catch (error) {
      try {
        await this.plugin.app.vault.modifyBinary(file, toArrayBuffer(original));
      } catch {
        // Original bytes already on disk.
      }
      console.error(error);
      new Notice("Could not store subtitles inside the video.");
    }
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
