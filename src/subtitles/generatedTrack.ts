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
