import { Platform, Plugin, TFile } from "obsidian";
import { VideoSurfaceManager } from "./integration/VideoSurface";
import type { VideoSubtitlesHost } from "./pluginHost";
import { DEFAULT_SETTINGS, mergeSettings, type VideoSubtitleSettings } from "./settings";
import { VideoSubtitlesSettingTab } from "./settingsTab";
import type { SubtitleCue } from "./subtitles/cues";
import { writeGeneratedCues } from "./subtitles/writeGenerated";
import { CreateQueue } from "./transcribe/batch";
import { pickAccuracyForHardware } from "./transcribe/hardware";
import { readHardware } from "./transcribe/node";
import type { TranscribeRange } from "./transcribe/range";
import {
  releaseTranscriber,
  removeInstalledTranscriber,
  shouldRemoveTranscriberOnUnload
} from "./transcribe/runtime";
import { BatchProgressDock } from "./ui/batchProgressDock";

export default class VideoSubtitlesPlugin extends Plugin implements VideoSubtitlesHost {
  subtitleSettings: VideoSubtitleSettings = { ...DEFAULT_SETTINGS };
  createQueue!: CreateQueue;
  private surfaces: VideoSurfaceManager | null = null;
  private appQuitting = false;

  async onload(): Promise<void> {
    this.subtitleSettings = mergeSettings(await this.loadData());
    await this.applyFirstRunAccuracy();
    this.createQueue = new CreateQueue(this);
    this.addChild(new BatchProgressDock(this));
    this.surfaces = new VideoSurfaceManager(this);
    this.addSettingTab(new VideoSubtitlesSettingTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("quit", () => {
        this.appQuitting = true;
      })
    );
    this.app.workspace.onLayoutReady(() => this.surfaces?.start());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.subtitleSettings);
    this.surfaces?.applyCueAppearance();
  }

  applyGenerated(
    file: TFile,
    cues: readonly SubtitleCue[],
    reload: boolean,
    range: TranscribeRange | null
  ): Promise<boolean> {
    return this.surfaces?.applyGenerated(file, cues, reload, range) ?? writeGeneratedCues(this, file, cues, range);
  }

  onunload(): void {
    this.createQueue?.abort();
    this.surfaces = null;
    void releaseTranscriber();
    if (!shouldRemoveTranscriberOnUnload(this.appQuitting)) return;
    removeInstalledTranscriber(this);
  }

  private async applyFirstRunAccuracy(): Promise<void> {
    if (this.subtitleSettings.accuracyInitialized || !Platform.isDesktopApp) return;
    try {
      this.subtitleSettings.transcriberAccuracy = pickAccuracyForHardware(readHardware());
      this.subtitleSettings.accuracyInitialized = true;
      await this.saveSettings();
    } catch (error) {
      console.error(error);
    }
  }
}
