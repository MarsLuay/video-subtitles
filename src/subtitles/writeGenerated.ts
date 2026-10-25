import { TFile, type Plugin } from "obsidian";
import { toArrayBuffer } from "./absorb/bytes";
import type { SubtitleCue } from "./cues";
import { spliceGeneratedTrack, upsertGeneratedTrack } from "./generatedTrack";
import { loadStoreFromVideo, saveStoreToVideo } from "./store";

export async function writeGeneratedCues(
  plugin: Plugin,
  file: TFile,
  cues: readonly SubtitleCue[],
  range: { startSec: number; endSec: number } | null = null
): Promise<boolean> {
  if (cues.length === 0) return false;
  const original = new Uint8Array(await plugin.app.vault.readBinary(file));
  const previous = loadStoreFromVideo(original);
  const store = range ? spliceGeneratedTrack(previous, cues, range) : upsertGeneratedTrack(previous, cues);
  try {
    const next = saveStoreToVideo(original, store);
    await plugin.app.vault.modifyBinary(file, toArrayBuffer(next));
    return true;
  } catch {
    try {
      await plugin.app.vault.modifyBinary(file, toArrayBuffer(original));
    } catch {
      /* keep going */
    }
    return false;
  }
}
