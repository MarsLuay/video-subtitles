export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type SubtitleMenuRow =
  | { kind: "off"; checked: boolean }
  | { kind: "track"; id: string; label: string; checked: boolean }
  | { kind: "import" }
  | { kind: "separator" }
  | { kind: "rate"; rate: number; checked: boolean }
  | { kind: "pip" };

export function buildSubtitleMenuRows(state: {
  tracks: readonly { id: string; label: string }[];
  activeTrackId: string | null;
  playbackRate: number;
}): SubtitleMenuRow[] {
  const rows: SubtitleMenuRow[] = [
    { kind: "off", checked: state.activeTrackId === null }
  ];
  for (const track of state.tracks) {
    rows.push({
      kind: "track",
      id: track.id,
      label: track.label,
      checked: state.activeTrackId === track.id
    });
  }
  rows.push({ kind: "import" });
  rows.push({ kind: "separator" });
  for (const rate of PLAYBACK_RATES) {
    rows.push({
      kind: "rate",
      rate,
      checked: Math.abs(state.playbackRate - rate) < 0.001
    });
  }
  rows.push({ kind: "separator" });
  rows.push({ kind: "pip" });
  return rows;
}
