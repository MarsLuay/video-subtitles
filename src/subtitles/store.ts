import { readAbsorbedPayload, stripAbsorbedPayload, writeAbsorbedPayload } from "./absorb/container";
import type { SubtitleCue } from "./cues";

export const STORE_VERSION = 1;

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  cues: SubtitleCue[];
}

export interface AbsorbedStore {
  version: typeof STORE_VERSION;
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
}

export function emptyStore(): AbsorbedStore {
  return { version: STORE_VERSION, tracks: [], activeTrackId: null };
}

function isCue(value: unknown): value is SubtitleCue {
  if (!value || typeof value !== "object") return false;
  const cue = value as SubtitleCue;
  return typeof cue.start === "number" && typeof cue.end === "number" && typeof cue.text === "string";
}

function isTrack(value: unknown): value is SubtitleTrack {
  if (!value || typeof value !== "object") return false;
  const track = value as SubtitleTrack;
  return typeof track.id === "string"
    && typeof track.label === "string"
    && typeof track.language === "string"
    && Array.isArray(track.cues)
    && track.cues.every(isCue);
}

export function decodeStore(payload: Uint8Array): AbsorbedStore {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(payload));
  if (!parsed || typeof parsed !== "object") throw new Error("invalid subtitle store");
  const record = parsed as {
    version?: unknown;
    tracks?: unknown;
    activeTrackId?: unknown;
  };
  if (record.version !== STORE_VERSION || !Array.isArray(record.tracks) || !record.tracks.every(isTrack)) {
    throw new Error("invalid subtitle store");
  }
  const tracks = record.tracks;
  const activeTrackId = typeof record.activeTrackId === "string" || record.activeTrackId === null
    ? record.activeTrackId
    : null;
  const known = new Set(tracks.map((track) => track.id));
  return {
    version: STORE_VERSION,
    tracks,
    activeTrackId: activeTrackId && known.has(activeTrackId) ? activeTrackId : null
  };
}

export function encodeStore(store: AbsorbedStore): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    version: STORE_VERSION,
    tracks: store.tracks,
    activeTrackId: store.activeTrackId
  }));
}

export function loadStoreFromVideo(bytes: Uint8Array): AbsorbedStore {
  const payload = readAbsorbedPayload(bytes);
  if (!payload) return emptyStore();
  try {
    return decodeStore(payload);
  } catch {
    return emptyStore();
  }
}

export function saveStoreToVideo(bytes: Uint8Array, store: AbsorbedStore): Uint8Array {
  if (store.tracks.length === 0) return stripAbsorbedPayload(bytes);
  return writeAbsorbedPayload(bytes, encodeStore(store));
}
