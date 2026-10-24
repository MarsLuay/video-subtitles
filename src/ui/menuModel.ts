export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type OverflowMenuRow =
  | { kind: "download" }
  | { kind: "playback-speed" }
  | { kind: "pip" }
  | { kind: "separator" }
  | { kind: "off"; checked: boolean }
  | { kind: "track"; id: string; label: string; checked: boolean }
  | { kind: "create" }
  | { kind: "import" };

export function buildSubtitleMenuRows(state: {
  tracks: readonly { id: string; label: string }[];
  activeTrackId: string | null;
}): OverflowMenuRow[] {
  const rows: OverflowMenuRow[] = [
    { kind: "download" },
    { kind: "playback-speed" },
    { kind: "pip" },
    { kind: "separator" },
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
  rows.push({ kind: "create" });
  rows.push({ kind: "import" });
  return rows;
}

export function playbackSpeedLabel(rate: number): string {
  return Math.abs(rate - 1) < 0.001 ? "Normal" : `${rate}×`;
}
