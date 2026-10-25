import { Modal, Notice, type App } from "obsidian";
import { bindDom } from "./bindDom";
import {
  formatClockTime,
  parseCreateRange,
  type TranscribeRange
} from "../transcribe/range";

export function promptCreateRange(
  app: App,
  durationSec: number,
  currentTime: () => number
): Promise<TranscribeRange | null> {
  return new Promise((resolve) => {
    new CreateRangeModal(app, durationSec, currentTime, resolve).open();
  });
}

class CreateRangeModal extends Modal {
  private settled = false;
  private startEl: HTMLInputElement | null = null;
  private endEl: HTMLInputElement | null = null;
  private focusTimer = 0;

  constructor(
    app: App,
    private readonly durationSec: number,
    private readonly currentTime: () => number,
    private readonly done: (range: TranscribeRange | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Create subtitles");
    this.contentEl.createEl("p", {
      text: "Only this part of the video is transcribed.",
      cls: "video-subtitles-create-range-hint"
    });
    this.startEl = this.addTimeRow("Start", "0:00");
    this.endEl = this.addTimeRow("End", formatClockTime(this.durationSec));
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    bindDom(this, cancel, "click", () => this.finish(null));
    const create = actions.createEl("button", { text: "Create", cls: "mod-cta" });
    bindDom(this, create, "click", () => this.submit());
    bindDom(this, this.contentEl, "keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.submit();
    });
    this.focusTimer = window.setTimeout(() => this.startEl?.focus(), 0);
  }

  onClose(): void {
    window.clearTimeout(this.focusTimer);
    this.focusTimer = 0;
    if (!this.settled) {
      this.settled = true;
      this.done(null);
    }
    this.contentEl.empty();
    this.startEl = null;
    this.endEl = null;
  }

  private addTimeRow(name: string, value: string): HTMLInputElement {
    const row = this.contentEl.createDiv({ cls: "video-subtitles-create-range-row" });
    row.createEl("label", { text: name, cls: "video-subtitles-create-range-label" });
    const input = row.createEl("input", {
      type: "text",
      attr: { spellcheck: "false", "aria-label": name }
    });
    input.value = value;
    const current = row.createEl("button", { text: "Current" });
    bindDom(this, current, "click", (event) => {
      event.preventDefault();
      input.value = formatClockTime(this.currentTime());
      input.focus();
    });
    return input;
  }

  private submit(): void {
    const range = parseCreateRange(this.startEl?.value ?? "", this.endEl?.value ?? "", this.durationSec);
    if (!range) {
      new Notice("Enter a start time before the end time, within the video.");
      return;
    }
    this.finish(range);
  }

  private finish(range: TranscribeRange | null): void {
    if (this.settled) return;
    this.settled = true;
    this.done(range);
    this.close();
  }
}
