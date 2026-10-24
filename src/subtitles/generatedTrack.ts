import { GENERATED_TRACK_LABEL } from "../settings";
import { newTrackId } from "./id";
import type { SubtitleCue } from "./cues";
import type { AbsorbedStore, SubtitleTrack } from "./store";

export function isGeneratedTrack(track: { label: string }): boolean {
  return track.label.trim().toLowerCase() === GENERATED_TRACK_LABEL;
}

export function upsertGeneratedTrack(store: AbsorbedStore, cues: readonly SubtitleCue[]): AbsorbedStore {
  const previous = store.tracks.find(isGeneratedTrack);
  const track: SubtitleTrack = {
    id: previous?.id ?? newTrackId(),
    label: GENERATED_TRACK_LABEL,
    language: previous?.language ?? "",
    cues: [...cues]
  };
  return {
    version: store.version,
    tracks: [...store.tracks.filter((row) => !isGeneratedTrack(row)), track],
    activeTrackId: track.id
  };
}

export function spliceGeneratedTrack(
  store: AbsorbedStore,
  cues: readonly SubtitleCue[],
  range: { startSec: number; endSec: number }
): AbsorbedStore {
  const previous = store.tracks.find(isGeneratedTrack);
  const kept = (previous?.cues ?? []).filter(
    (cue) => cue.end <= range.startSec + 1e-6 || cue.start >= range.endSec - 1e-6
  );
  const next = [...kept, ...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  return upsertGeneratedTrack(store, next);
}
