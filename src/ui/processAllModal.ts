import { Modal, type App } from "obsidian";
import { bindDom } from "./bindDom";

export function confirmProcessAll(app: App, count: number): Promise<boolean> {
  return new Promise((resolve) => {
    new ProcessAllModal(app, count, resolve).open();
  });
}

class ProcessAllModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly count: number,
    private readonly done: (ok: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Process all videos");
    const count = this.count === 1 ? "1 video" : `${this.count} videos`;
    this.contentEl.createEl("p", {
      text: `This transcribes ${count} in the vault. It can take a long time.`,
      cls: "video-subtitles-process-all-hint"
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    bindDom(this, cancel, "click", () => this.finish(false));
    const process = actions.createEl("button", { text: "Process all videos", cls: "mod-cta" });
    bindDom(this, process, "click", () => this.finish(true));
  }

  onClose(): void {
    if (!this.settled) {
      this.settled = true;
      this.done(false);
    }
    this.contentEl.empty();
  }

  private finish(ok: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.done(ok);
    this.close();
  }
}
