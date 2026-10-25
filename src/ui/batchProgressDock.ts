import { Component } from "obsidian";
import type { VideoSubtitlesHost } from "../pluginHost";
import { paintBatchProgress } from "./batchProgress";

export class BatchProgressDock extends Component {
  private readonly el: HTMLElement;

  constructor(private readonly host: VideoSubtitlesHost) {
    super();
    this.el = host.app.workspace.containerEl.createDiv({ cls: "video-subtitles-batch-dock" });
    this.el.addClass("video-subtitles-batch-dock-hidden");
  }

  onload(): void {
    this.register(this.host.createQueue.subscribe(() => this.paint()));
    this.register(() => this.el.remove());
    this.paint();
  }

  private paint(): void {
    const snapshot = this.host.createQueue.snapshot();
    const show = snapshot.running;
    this.el.toggleClass("video-subtitles-batch-dock-hidden", !show);
    if (show) paintBatchProgress(this.el, snapshot);
    else this.el.empty();
  }
}
