import { Notice } from "obsidian";
import { formatCreateProgress, monotonicPercent } from "../transcribe/progress";

export function showCreateProgressNotice(): {
  setPercent: (percent: number, remainingSec?: number | null) => void;
  hide: () => void;
} {
  let shown = 1;
  let remaining: number | null = null;
  const notice = new Notice("", 0);
  const host = notice.messageEl;
  host.empty();
  host.addClass("video-subtitles-progress-notice");
  const label = host.createDiv({ cls: "video-subtitles-progress-label" });
  const track = host.createDiv({ cls: "video-subtitles-progress" });
  track.createDiv({ cls: "video-subtitles-progress-fill" });
  const setPercent = (percent: number, remainingSec?: number | null): void => {
    shown = monotonicPercent(shown, percent);
    remaining = remainingSec === undefined ? null : remainingSec;
    try {
      label.setText(formatCreateProgress(shown, remaining));
    } catch {
      /* keep creating */
    }
  };
  setPercent(1);
  return { setPercent, hide: () => notice.hide() };
}
