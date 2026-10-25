import { FileSystemAdapter, type Plugin, type TFile } from "obsidian";
import { readContainedFile } from "./containedFs";
import { existsFile, removePath } from "./download";
import { extractWav, ensureFfmpeg } from "./ffmpeg";
import { decodeVideoAudio, pcmWindows, readWavPcm, shiftCues, slicePcm, WHISPER_SAMPLE_RATE } from "./audio";
import { normalizeTranscribeRange, type TranscribeRange } from "./range";
import { loadFs, loadPath, loadUrl } from "./node";
import { transcribePcm } from "./lib";
import { yieldToTracker, type CreateProgressFn } from "./progress";
import {
  CREATE_RESUME_FILE,
  clearCreateResume as removeResumeFile,
  createResumeJob,
  readCreateResume,
  resumeMatches,
  writeCreateResume
} from "./resume";
import { toArrayBuffer } from "../subtitles/absorb/bytes";
import type { CreateTranscribeSettings } from "../settings";
import type { SubtitleCue } from "../subtitles/cues";

const DECODE_AUDIO_MAX_BYTES = 80 * 1024 * 1024;

export function vaultBasePath(plugin: Plugin): string {
  const adapter = plugin.app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error("Creating subtitles needs a local vault");
  }
  return adapter.getBasePath();
}

export function transcriberRoot(plugin: Plugin): string {
  const path = loadPath();
  const dir = plugin.manifest.dir;
  if (!dir) throw new Error("Plugin folder is missing");
  return path.join(vaultBasePath(plugin), dir, "transcriber");
}

export function transcriberPaths(root: string): { lib: string; models: string; bin: string; tmp: string } {
  const path = loadPath();
  return {
    lib: path.join(root, "lib"),
    models: path.join(root, "models"),
    bin: path.join(root, "bin"),
    tmp: path.join(root, "tmp")
  };
}

export function transcriberCleanupPath(root: string, keep: boolean): string {
  const trimmed = root.replace(/[/\\]+$/, "");
  return keep ? `${trimmed}/tmp` : trimmed;
}

export function createResumePath(plugin: Plugin): string {
  const path = loadPath();
  return path.join(path.dirname(transcriberRoot(plugin)), CREATE_RESUME_FILE);
}

export function clearCreateResume(plugin: Plugin): void {
  const file = createResumePath(plugin);
  removeResumeFile(file);
}

export function cleanupTranscriber(root: string, keep: boolean): void {
  if (!keep) {
    removePath(root);
    return;
  }
  const path = loadPath();
  removePath(path.join(root, "tmp"));
}

export function shouldRemoveTranscriberOnUnload(appQuitting: boolean): boolean {
  return !appQuitting;
}

export function removeInstalledTranscriber(plugin: Plugin): void {
  try {
    const root = transcriberRoot(plugin);
    cleanupTranscriber(root, false);
    clearCreateResume(plugin);
  } catch {
    /* plugin folder may already be gone */
  }
}

export function vaultFileAbsPath(plugin: Plugin, file: TFile): string {
  const path = loadPath();
  return path.join(vaultBasePath(plugin), file.path);
}

export function fileResourceUrl(plugin: Plugin, absPath: string): string {
  const adapter = plugin.app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    const base = adapter.getBasePath().replace(/\\/g, "/");
    const normalized = absPath.replace(/\\/g, "/");
    if (normalized.startsWith(base)) {
      const rel = normalized.slice(base.length).replace(/^\//, "");
      return adapter.getResourcePath(rel).replace(/[?#].*$/, "");
    }
  }
  const { pathToFileURL } = loadUrl();
  return pathToFileURL(absPath).href;
}

export async function transcribeVideoFile(
  plugin: Plugin,
  videoPath: string,
  settings: CreateTranscribeSettings,
  win: Window,
  onProgress?: CreateProgressFn,
  onPartialCues?: (cues: readonly SubtitleCue[]) => void | Promise<void>,
  range: TranscribeRange | null = null
): Promise<SubtitleCue[]> {
  const fs = loadFs();
  const path = loadPath();
  const vaultRoot = vaultBasePath(plugin);
  const root = transcriberRoot(plugin);
  const dirs = transcriberPaths(root);
  fs.mkdirSync(dirs.lib, { recursive: true });
  fs.mkdirSync(dirs.models, { recursive: true });
  fs.mkdirSync(dirs.bin, { recursive: true });
  fs.mkdirSync(dirs.tmp, { recursive: true });
  onProgress?.(0, null, "load");
  let pcm: Float32Array | null = null;
  const size = fs.statSync(videoPath).size;
  if (size > 0 && size <= DECODE_AUDIO_MAX_BYTES) {
    if (!videoPath.startsWith(vaultRoot)) throw new Error("path escapes root");
    const bytes = readContainedFile(vaultRoot, videoPath);
    pcm = await decodeVideoAudio(toArrayBuffer(bytes), win);
  }
  if (!pcm) {
    onProgress?.(10, null, "load");
    const ffmpeg = await ensureFfmpeg(dirs.bin);
    const wavPath = path.join(dirs.tmp, "audio.wav");
    await extractWav(ffmpeg, videoPath, wavPath);
    if (!wavPath.startsWith(root)) throw new Error("path escapes root");
    pcm = readWavPcm(readContainedFile(root, wavPath));
    if (existsFile(wavPath)) fs.unlinkSync(wavPath);
  }
  if (pcm.length === 0) throw new Error("The video has no audio to transcribe");
  const durationSec = pcm.length / WHISPER_SAMPLE_RATE;
  const slice = range ? normalizeTranscribeRange(range.startSec, range.endSec, durationSec) : null;
  if (range && !slice) throw new Error("That time range is not in the video.");
  if (slice) pcm = slicePcm(pcm, slice);
  if (pcm.length === 0) throw new Error("That time range has no audio to transcribe");
  const offsetSec = slice?.startSec ?? 0;
  const toVideoCues = (cues: readonly SubtitleCue[]): SubtitleCue[] => shiftCues(cues, offsetSec);
  onProgress?.(15, null, "load");
  await yieldToTracker();
  const resumeFile = createResumePath(plugin);
  const job = createResumeJob({
    videoPath,
    pcmLength: pcm.length,
    windowCount: pcmWindows(pcm).length,
    settings,
    range: slice
  });
  const saved = readCreateResume(vaultRoot, resumeFile);
  const resume = resumeMatches(saved, job) ? saved : null;
  if (resume && resume.cues.length > 0 && onPartialCues) {
    try {
      await onPartialCues(toVideoCues(resume.cues));
    } catch {
      /* keep transcribing */
    }
  }
  try {
    return toVideoCues(
      await transcribePcm(
        pcm,
        settings,
        dirs.lib,
        dirs.models,
        (file) => fileResourceUrl(plugin, file),
        onProgress,
        {
          startWindow: resume?.nextWindow,
          cues: resume?.cues,
          fallback: resume?.fallback,
          onCheckpoint: async (state) => {
            try {
              writeCreateResume(vaultRoot, resumeFile, { ...job, ...state });
            } catch {
              /* keep transcribing */
            }
            if (state.cues.length > 0 && onPartialCues) await onPartialCues(toVideoCues(state.cues));
          }
        }
      )
    );
  } catch (error) {
    if (error instanceof Error && error.message === "The transcriber returned no speech") {
      clearCreateResume(plugin);
    }
    throw error;
  }
}
