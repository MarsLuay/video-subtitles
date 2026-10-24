import { Notice } from "obsidian";
import {
  clampPercent,
  formatCreateProgress,
  monotonicPercent,
  type CreateProgressPhase
} from "../transcribe/progress";

export function showCreateProgressNotice(): {
  setPercent: (percent: number, remainingSec?: number | null, phase?: CreateProgressPhase) => void;
  hide: () => void;
} {
  let shown = 0;
  let phase: CreateProgressPhase = "load";
  let remaining: number | null = null;
  const notice = new Notice("", 0);
  const host = notice.messageEl;
  host.empty();
  host.addClass("video-subtitles-progress-notice");
  const label = host.createDiv({ cls: "video-subtitles-progress-label" });
  const track = host.createDiv({ cls: "video-subtitles-progress" });
  track.createDiv({ cls: "video-subtitles-progress-fill" });
  const setPercent = (
    percent: number,
    remainingSec?: number | null,
    nextPhase?: CreateProgressPhase
  ): void => {
    const phaseNow = nextPhase ?? phase;
    shown = phaseNow === phase ? monotonicPercent(shown, percent) : clampPercent(percent);
    phase = phaseNow;
    remaining = remainingSec === undefined ? null : remainingSec;
    try {
      label.setText(formatCreateProgress(shown, remaining, phase));
    } catch {
      /* keep creating */
    }
  };
  setPercent(0, null, "load");
  return { setPercent, hide: () => notice.hide() };
}
