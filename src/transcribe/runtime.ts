import { FileSystemAdapter, type Plugin, type TFile } from "obsidian";
import { existsFile, removePath } from "./download";
import { extractWav, ensureFfmpeg } from "./ffmpeg";
import { decodeVideoAudio, pcmWindows, readWavPcm } from "./audio";
import { nodeRequire } from "./node";
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

export function transcriberRoot(plugin: Plugin): string {
  const adapter = plugin.app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error("Creating subtitles needs a local vault");
  }
  const path = nodeRequire<typeof import("path")>("path");
  const dir = plugin.manifest.dir;
  if (!dir) throw new Error("Plugin folder is missing");
  return path.join(adapter.getBasePath(), dir, "transcriber");
}

export function transcriberPaths(root: string): { lib: string; models: string; bin: string; tmp: string } {
  const path = nodeRequire<typeof import("path")>("path");
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
  const path = nodeRequire<typeof import("path")>("path");
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
  const path = nodeRequire<typeof import("path")>("path");
  removePath(path.join(root, "tmp"));
}

export function vaultFileAbsPath(plugin: Plugin, file: TFile): string {
  const adapter = plugin.app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error("Creating subtitles needs a local vault");
  }
  const path = nodeRequire<typeof import("path")>("path");
  return path.join(adapter.getBasePath(), file.path);
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
  const { pathToFileURL } = nodeRequire<typeof import("url")>("url");
  return pathToFileURL(absPath).href;
}

export async function transcribeVideoFile(
  plugin: Plugin,
  videoPath: string,
  settings: CreateTranscribeSettings,
  win: Window,
  onProgress?: CreateProgressFn,
  onPartialCues?: (cues: readonly SubtitleCue[]) => void | Promise<void>
): Promise<SubtitleCue[]> {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const path = nodeRequire<typeof import("path")>("path");
  const root = transcriberRoot(plugin);
  const dirs = transcriberPaths(root);
  fs.mkdirSync(dirs.lib, { recursive: true });
  fs.mkdirSync(dirs.models, { recursive: true });
  fs.mkdirSync(dirs.bin, { recursive: true });
  fs.mkdirSync(dirs.tmp, { recursive: true });
  onProgress?.(4);
  let pcm: Float32Array | null = null;
  const size = fs.statSync(videoPath).size;
  if (size > 0 && size <= DECODE_AUDIO_MAX_BYTES) {
    const bytes = new Uint8Array(fs.readFileSync(videoPath));
    pcm = await decodeVideoAudio(toArrayBuffer(bytes), win);
  }
  if (!pcm) {
    onProgress?.(8);
    const ffmpeg = await ensureFfmpeg(dirs.bin);
    const wavPath = path.join(dirs.tmp, "audio.wav");
    await extractWav(ffmpeg, videoPath, wavPath);
    pcm = readWavPcm(fs.readFileSync(wavPath));
    if (existsFile(wavPath)) fs.unlinkSync(wavPath);
  }
  if (pcm.length === 0) throw new Error("The video has no audio to transcribe");
  onProgress?.(15);
  await yieldToTracker();
  const resumeFile = createResumePath(plugin);
  const job = createResumeJob({
    videoPath,
    pcmLength: pcm.length,
    windowCount: pcmWindows(pcm).length,
    settings
  });
  const saved = readCreateResume(resumeFile);
  const resume = resumeMatches(saved, job) ? saved : null;
  if (resume && resume.cues.length > 0 && onPartialCues) {
    try {
      await onPartialCues(resume.cues);
    } catch {
      /* keep transcribing */
    }
  }
  try {
    return await transcribePcm(
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
            writeCreateResume(resumeFile, { ...job, ...state });
          } catch {
            /* keep transcribing */
          }
          if (state.cues.length > 0 && onPartialCues) await onPartialCues(state.cues);
        }
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "The transcriber returned no speech") {
      clearCreateResume(plugin);
    }
    throw error;
  }
}
