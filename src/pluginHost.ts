import type { Plugin, TFile } from "obsidian";
import type { VideoSubtitleSettings } from "./settings";
import type { SubtitleCue } from "./subtitles/cues";
import type { CreateQueue } from "./transcribe/batch";
import type { TranscribeRange } from "./transcribe/range";

export type VideoSubtitlesHost = Plugin & {
  subtitleSettings: VideoSubtitleSettings;
  saveSettings: () => Promise<void>;
  createQueue: CreateQueue;
  applyGenerated: (
    file: TFile,
    cues: readonly SubtitleCue[],
    reload: boolean,
    range: TranscribeRange | null
  ) => Promise<boolean>;
};
