import { clampCueOpacity, type VideoSubtitleSettings } from "../settings";
import { cueTextAt, type SubtitleCue } from "../subtitles/cues";

export function cueOverlayOpacity(settings: Pick<VideoSubtitleSettings, "transparentBackground" | "cueOpacity">): number {
  if (!settings.transparentBackground) return 1;
  return clampCueOpacity(settings.cueOpacity) / 100;
}

export function applyCueAppearance(
  el: HTMLElement,
  settings: Pick<VideoSubtitleSettings, "transparentBackground" | "cueOpacity">
): void {
  el.toggleClass("is-transparent", settings.transparentBackground);
  el.setCssProps({
    "--video-subtitles-cue-opacity": String(cueOverlayOpacity(settings))
  });
}

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
