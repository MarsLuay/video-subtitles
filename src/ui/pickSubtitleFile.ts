export interface PickedSubtitleFile {
  name: string;
  text: string;
}

export function pickSubtitleFile(doc: Document): Promise<PickedSubtitleFile | null> {
  return new Promise((resolve) => {
    const input = doc.body.createEl("input", {
      cls: "video-subtitles-file-input",
      type: "file",
      attr: {
        accept: ".srt,.vtt,text/vtt,application/x-subrip",
        "aria-hidden": "true"
      }
    });
    let settled = false;
    const finish = (value: PickedSubtitleFile | null) => {
      if (settled) return;
      settled = true;
      input.detach();
      resolve(value);
    };
    input.addEventListener("change", () => {
      const file = input.files?.item(0);
      if (!file) {
        finish(null);
        return;
      }
      void file.text().then((text) => finish({ name: file.name, text })).catch(() => finish(null));
    });
    input.addEventListener("cancel", () => finish(null));
    input.click();
  });
}
