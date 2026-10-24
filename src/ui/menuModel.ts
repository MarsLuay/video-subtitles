export type SubtitleMenuRow =
  | { kind: "off"; checked: boolean }
  | { kind: "track"; id: string; label: string; checked: boolean }
  | { kind: "import" };

export function isNativeSubtitleMenu(source: string): boolean {
  return source === "more-options";
}

export function buildSubtitleMenuRows(state: {
  tracks: readonly { id: string; label: string }[];
  activeTrackId: string | null;
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
  return rows;
}
