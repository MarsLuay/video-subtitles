import { WHISPER_CHUNK_SECONDS, WHISPER_SAMPLE_RATE, WHISPER_STRIDE_SECONDS } from "./audio";
import { existsFile, removePath } from "./download";
import { nodeRequire } from "./node";
import type { CreateTranscribeSettings } from "../settings";
import type { SubtitleCue } from "../subtitles/cues";
import { fullRangeFromPcm, rangeToMs, type TranscribeRange } from "./range";

export const CREATE_RESUME_VERSION = 3 as const;
export const CREATE_RESUME_FILE = "create-resume.json";

export type CreateResumeJob = {
  version: typeof CREATE_RESUME_VERSION;
  videoPath: string;
  pcmLength: number;
  windowCount: number;
  chunkSec: number;
  strideSec: number;
  transcriberAccuracy: string;
  transcriberLanguage: string;
  translateToEnglish: boolean;
  wordTimestamps: boolean;
  rangeStartMs: number;
  rangeEndMs: number;
};

export type CreateResumeState = CreateResumeJob & {
  nextWindow: number;
  cues: SubtitleCue[];
  fallback: string;
};

export type TranscribePcmResume = {
  startWindow?: number | undefined;
  cues?: readonly SubtitleCue[] | undefined;
  fallback?: string | undefined;
  onCheckpoint?:
    | ((state: { nextWindow: number; cues: SubtitleCue[]; fallback: string }) => void | Promise<void>)
    | undefined;
};

export function createResumeJob(input: {
  videoPath: string;
  pcmLength: number;
  windowCount: number;
  settings: CreateTranscribeSettings;
  range: TranscribeRange | null;
}): CreateResumeJob {
  const range = input.range ?? fullRangeFromPcm(input.pcmLength, WHISPER_SAMPLE_RATE);
  const { rangeStartMs, rangeEndMs } = rangeToMs(range);
  return {
    version: CREATE_RESUME_VERSION,
    videoPath: input.videoPath,
    pcmLength: input.pcmLength,
    windowCount: input.windowCount,
    chunkSec: WHISPER_CHUNK_SECONDS,
    strideSec: WHISPER_STRIDE_SECONDS,
    transcriberAccuracy: input.settings.transcriberAccuracy,
    transcriberLanguage: input.settings.transcriberLanguage,
    translateToEnglish: input.settings.translateToEnglish,
    wordTimestamps: input.settings.wordTimestamps,
    rangeStartMs,
    rangeEndMs
  };
}

export function parseResumeState(raw: unknown): CreateResumeState | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  if (src.version !== CREATE_RESUME_VERSION && src.version !== 1 && src.version !== 2) return null;
  if (typeof src.videoPath !== "string" || !src.videoPath) return null;
  if (!isFiniteNumber(src.pcmLength)) return null;
  if (!isFiniteNumber(src.windowCount) || !isFiniteNumber(src.nextWindow)) return null;
  if (!isFiniteNumber(src.chunkSec) || !isFiniteNumber(src.strideSec)) return null;
  if (typeof src.transcriberAccuracy !== "string" || typeof src.transcriberLanguage !== "string") return null;
  if (typeof src.translateToEnglish !== "boolean" || typeof src.wordTimestamps !== "boolean") return null;
  if (!Array.isArray(src.cues)) return null;
  const cues: SubtitleCue[] = [];
  for (const row of src.cues) {
    if (!isCue(row)) return null;
    cues.push({ start: row.start, end: row.end, text: row.text });
  }
  const nextWindow = Math.round(src.nextWindow);
  const windowCount = Math.round(src.windowCount);
  if (nextWindow < 0 || nextWindow > windowCount) return null;
  const pcmLength = Math.round(src.pcmLength);
  const inferred = rangeToMs(fullRangeFromPcm(pcmLength, WHISPER_SAMPLE_RATE));
  const rangeStartMs = isFiniteNumber(src.rangeStartMs) ? Math.round(src.rangeStartMs) : inferred.rangeStartMs;
  const rangeEndMs = isFiniteNumber(src.rangeEndMs) ? Math.round(src.rangeEndMs) : inferred.rangeEndMs;
  if (rangeStartMs < 0 || rangeEndMs < rangeStartMs) return null;
  return {
    version: CREATE_RESUME_VERSION,
    videoPath: src.videoPath,
    pcmLength,
    windowCount,
    chunkSec: src.chunkSec,
    strideSec: src.strideSec,
    transcriberAccuracy: src.transcriberAccuracy,
    transcriberLanguage: src.transcriberLanguage,
    translateToEnglish: src.translateToEnglish,
    wordTimestamps: src.wordTimestamps,
    rangeStartMs,
    rangeEndMs,
    nextWindow,
    cues,
    fallback: typeof src.fallback === "string" ? src.fallback : ""
  };
}

export function resumeMatches(saved: unknown, job: CreateResumeJob): saved is CreateResumeState {
  const state = parseResumeState(saved);
  if (!state) return false;
  return (
    state.videoPath === job.videoPath &&
    state.pcmLength === job.pcmLength &&
    state.windowCount === job.windowCount &&
    state.chunkSec === job.chunkSec &&
    state.strideSec === job.strideSec &&
    state.transcriberAccuracy === job.transcriberAccuracy &&
    state.transcriberLanguage === job.transcriberLanguage &&
    state.translateToEnglish === job.translateToEnglish &&
    state.wordTimestamps === job.wordTimestamps &&
    state.rangeStartMs === job.rangeStartMs &&
    state.rangeEndMs === job.rangeEndMs
  );
}

export function readCreateResume(file: string): CreateResumeState | null {
  if (!existsFile(file)) return null;
  try {
    const fs = nodeRequire<typeof import("fs")>("fs");
    return parseResumeState(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function writeCreateResume(file: string, state: CreateResumeState): void {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const path = nodeRequire<typeof import("path")>("path");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  if (existsFile(file)) fs.unlinkSync(file);
  fs.renameSync(tmp, file);
}

export function clearCreateResume(file: string): void {
  removePath(file);
  removePath(`${file}.tmp`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCue(value: unknown): value is SubtitleCue {
  if (!value || typeof value !== "object") return false;
  const cue = value as Record<string, unknown>;
  return isFiniteNumber(cue.start) && isFiniteNumber(cue.end) && typeof cue.text === "string";
}
