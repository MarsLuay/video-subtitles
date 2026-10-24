import { cueTextAt, type SubtitleCue } from "../subtitles/cues";

export function renderCueOverlay(el: HTMLElement, cues: readonly SubtitleCue[], time: number): void {
  const text = cueTextAt(cues, time);
  el.empty();
  if (!text) {
    el.addClass("is-empty");
    return;
  }
  el.removeClass("is-empty");
  el.createSpan({ cls: "video-subtitles-cue-line", text });
}
