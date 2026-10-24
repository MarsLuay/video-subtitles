export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export function cueTextAt(cues: readonly SubtitleCue[], time: number): string {
  return cues
    .filter((cue) => time >= cue.start && time < cue.end)
    .map((cue) => cue.text)
    .join("\n");
}

export function labelFromFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "");
  const trimmed = base.replace(/\.(srt|vtt)$/i, "");
  return trimmed || base || "Subtitle";
}
