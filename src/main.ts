import { Platform, Plugin } from "obsidian";
import { VideoSurfaceManager } from "./integration/VideoSurface";
import { DEFAULT_SETTINGS, mergeSettings, type VideoSubtitleSettings } from "./settings";
import { VideoSubtitlesSettingTab } from "./settingsTab";
import { pickAccuracyForHardware } from "./transcribe/hardware";
import { readHardware } from "./transcribe/node";
import { removeInstalledTranscriber, shouldRemoveTranscriberOnUnload } from "./transcribe/runtime";

export default class VideoSubtitlesPlugin extends Plugin {
  subtitleSettings: VideoSubtitleSettings = { ...DEFAULT_SETTINGS };
  private surfaces: VideoSurfaceManager | null = null;
  private appQuitting = false;

  async onload(): Promise<void> {
    this.subtitleSettings = mergeSettings(await this.loadData());
    await this.applyFirstRunAccuracy();
    this.addSettingTab(new VideoSubtitlesSettingTab(this.app, this));
    this.surfaces = new VideoSurfaceManager(this);
    this.registerEvent(
      this.app.workspace.on("quit", () => {
        this.appQuitting = true;
      })
    );
    this.app.workspace.onLayoutReady(() => this.surfaces?.start());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.subtitleSettings);
  }

  onunload(): void {
    this.surfaces = null;
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
