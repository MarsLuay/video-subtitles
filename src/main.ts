import { Plugin } from "obsidian";
import { VideoSurfaceManager } from "./integration/VideoSurface";

export default class VideoSubtitlesPlugin extends Plugin {
  private surfaces: VideoSurfaceManager | null = null;

  async onload(): Promise<void> {
    this.surfaces = new VideoSurfaceManager(this);
    this.app.workspace.onLayoutReady(() => this.surfaces?.start());
  }

  onunload(): void {
    this.surfaces = null;
  }
}
