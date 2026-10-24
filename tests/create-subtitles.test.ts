import { describe, expect, it, vi } from "vitest";
import {
  appendWindowCues,
  chunksToCues,
  mixToMono,
  pcmWindows,
  readWavPcm,
  resampleLinear,
  WHISPER_SAMPLE_RATE
} from "../src/transcribe/audio";
import { ffmpegAsset, FFMPEG_RELEASE } from "../src/transcribe/ffmpeg";
import { pickAccuracyForHardware } from "../src/transcribe/hardware";
import {
  forceWebOnnxSource,
  inferenceDevice,
  ONNXRUNTIME_WEB_VERSION,
  TRANSFORMERS_VERSION,
  transcriberLibFiles
} from "../src/transcribe/lib";
import { whisperModelId } from "../src/transcribe/models";
import { transcriberCleanupPath } from "../src/transcribe/runtime";
import {
  formatCreateProgress,
  formatRemaining,
  loadStagePercent,
  mergeFileProgress,
  monotonicPercent,
  remainingTranscribeSeconds,
  startEstimate,
  transcribeStagePercent
} from "../src/transcribe/progress";
import { labelSpeakers, prefixSpeaker } from "../src/transcribe/diarize";
import { createResumeJob, parseResumeState, resumeMatches } from "../src/transcribe/resume";
import { upsertGeneratedTrack } from "../src/subtitles/generatedTrack";
import { emptyStore } from "../src/subtitles/store";
import { VideoSubtitlesSettingTab, type SettingsHost } from "../src/settingsTab";
import {
  ACCURACY_LABELS,
  DEFAULT_SETTINGS,
  GENERATED_TRACK_LABEL,
  LANGUAGE_LABELS,
  MAX_SPEAKERS,
  mergeSettings,
  TRANSCRIBER_ACCURACY,
  TRANSCRIBER_LANGUAGE,
  whisperInputOptions,
  type VideoSubtitleSettings
} from "../src/settings";

function gb(value: number): number {
  return value * 1024 * 1024 * 1024;
}

function pcm16Wav(samples: Int16Array, sampleRate = 16_000, channels = 1): Uint8Array {
  const dataSize = samples.byteLength;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  bytes.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength), 44);
  return bytes;
}

describe("subtitle settings", () => {
  it("keeps the transcriber by default and leaves first-run accuracy unset", () => {
    expect(DEFAULT_SETTINGS.keepTranscriber).toBe(true);
    expect(DEFAULT_SETTINGS.accuracyInitialized).toBe(false);
    expect(DEFAULT_SETTINGS.diarization).toBe(false);
    expect(DEFAULT_SETTINGS.transcriberLanguage).toBe("auto");
    expect(DEFAULT_SETTINGS.translateToEnglish).toBe(false);
    expect(DEFAULT_SETTINGS.wordTimestamps).toBe(false);
    expect(mergeSettings(undefined).keepTranscriber).toBe(true);
    expect(mergeSettings({ keepTranscriber: false }).keepTranscriber).toBe(false);
    expect(mergeSettings({ transcriberAccuracy: "large", accuracyInitialized: true })).toEqual({
      keepTranscriber: true,
      transcriberAccuracy: "large",
      accuracyInitialized: true,
      transcriberLanguage: "auto",
      translateToEnglish: false,
      wordTimestamps: false,
      diarization: false,
      maxSpeakers: 2
    });
    expect(mergeSettings({ transcriberAccuracy: "nope" }).transcriberAccuracy).toBe("base");
    expect(mergeSettings({ diarization: true, maxSpeakers: 3, transcriberLanguage: "fr" })).toMatchObject({
      diarization: true,
      maxSpeakers: 3,
      transcriberLanguage: "fr"
    });
    expect(mergeSettings({ maxSpeakers: 9, transcriberLanguage: "xx" })).toMatchObject({
      maxSpeakers: 2,
      transcriberLanguage: "auto"
    });
    expect(TRANSCRIBER_ACCURACY.every((value) => value in ACCURACY_LABELS)).toBe(true);
    expect(TRANSCRIBER_LANGUAGE.every((value) => value in LANGUAGE_LABELS)).toBe(true);
    expect(MAX_SPEAKERS).toEqual([2, 3, 4]);
  });

  it("maps Create settings onto Whisper generate options", () => {
    expect(whisperInputOptions(DEFAULT_SETTINGS)).toEqual({ return_timestamps: true });
    expect(
      whisperInputOptions({
        ...DEFAULT_SETTINGS,
        transcriberLanguage: "es",
        translateToEnglish: true,
        wordTimestamps: true
      })
    ).toEqual({
      return_timestamps: "word",
      language: "es",
      task: "translate"
    });
  });

  it("lists diarization and other Create options in settings", () => {
    const host = {
      app: { workspace: { containerEl: document.createElement("div") }, vault: {} },
      subtitleSettings: { ...DEFAULT_SETTINGS } satisfies VideoSubtitleSettings,
      saveSettings: async () => undefined
    } as unknown as SettingsHost;
    const tab = new VideoSubtitlesSettingTab(host.app, host);
    expect(tab.getSettingDefinitions().map((def) => def.name)).toEqual([
      "Keep transcriber",
      "Transcriber accuracy",
      "Language",
      "Translate to English",
      "Word timestamps",
      "Diarization",
      "Max speakers"
    ]);
  });
});

describe("diarization", () => {
  it("prefixes distinct speakers from local audio and leaves existing labels", () => {
    expect(prefixSpeaker("hello", 2)).toBe("Speaker 2: hello");
    expect(prefixSpeaker("Speaker 1: already", 3)).toBe("Speaker 1: already");
    const pcm = new Float32Array(WHISPER_SAMPLE_RATE * 2);
    pcm.fill(0.9, 0, WHISPER_SAMPLE_RATE);
    pcm.fill(0.02, WHISPER_SAMPLE_RATE);
    const labeled = labelSpeakers(
      pcm,
      [
        { start: 0, end: 1, text: "loud" },
        { start: 1, end: 2, text: "quiet" }
      ],
      2
    );
    expect(labeled[0]?.text).toMatch(/^Speaker 1: loud$/);
    expect(labeled[1]?.text).toMatch(/^Speaker 2: quiet$/);
  });
});

describe("create resume", () => {
  it("resumes the same video and transcriber settings, and starts over if those changed", () => {
    const job = createResumeJob({
      videoPath: "/vault/clip.mp4",
      pcmLength: 48_000,
      windowCount: 4,
      settings: DEFAULT_SETTINGS
    });
    const saved = {
      ...job,
      nextWindow: 2,
      cues: [{ start: 0, end: 1, text: "hello" }],
      fallback: ""
    };
    expect(resumeMatches(saved, job)).toBe(true);
    expect(parseResumeState(saved)?.nextWindow).toBe(2);
    expect(resumeMatches({ ...saved, size: 8, mtimeMs: 1 }, job)).toBe(true);
    expect(
      resumeMatches(
        {
          ...saved,
          version: 1,
          size: 4096,
          mtimeMs: 1700000000000
        },
        job
      )
    ).toBe(true);
    expect(resumeMatches({ ...saved, transcriberAccuracy: "tiny" }, job)).toBe(false);
    expect(resumeMatches({ ...saved, transcriberLanguage: "fr" }, job)).toBe(false);
    expect(resumeMatches({ ...saved, pcmLength: 16 }, job)).toBe(false);
    expect(resumeMatches({ ...saved, nextWindow: 5 }, job)).toBe(false);
    expect(resumeMatches({ ...saved, nextWindow: 4 }, job)).toBe(true);
    expect(parseResumeState({ ...saved, cues: [{ start: 0 }] })).toBeNull();
  });
});

describe("hardware accuracy pick", () => {
  it("picks a Whisper size from RAM and Apple silicon only on first run logic", () => {
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(8), cpuModel: "Intel" })).toBe("tiny");
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(12), cpuModel: "Intel" })).toBe("base");
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(16), cpuModel: "Intel" })).toBe("base");
    expect(pickAccuracyForHardware({ platform: "darwin", arch: "arm64", totalmem: gb(16), cpuModel: "Apple M4" })).toBe("small");
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(24), cpuModel: "AMD" })).toBe("small");
    expect(pickAccuracyForHardware({ platform: "darwin", arch: "arm64", totalmem: gb(32), cpuModel: "Apple M4" })).toBe("medium");
    expect(pickAccuracyForHardware({ platform: "darwin", arch: "arm64", totalmem: gb(64), cpuModel: "Apple M4 Max" })).toBe("large");
  });
});

describe("generated track", () => {
  it("upserts an embedded generated track and keeps its id", () => {
    const first = upsertGeneratedTrack(emptyStore(), [{ start: 0, end: 1, text: "one" }]);
    expect(first.tracks).toHaveLength(1);
    expect(first.tracks[0]?.label).toBe(GENERATED_TRACK_LABEL);
    expect(first.activeTrackId).toBe(first.tracks[0]?.id);
    const second = upsertGeneratedTrack(first, [{ start: 0, end: 2, text: "two" }]);
    expect(second.tracks).toHaveLength(1);
    expect(second.tracks[0]?.id).toBe(first.tracks[0]?.id);
    expect(second.tracks[0]?.cues).toEqual([{ start: 0, end: 2, text: "two" }]);
  });
});

describe("create progress", () => {
  it("formats a monotonic percent and tracks model file downloads", () => {
    expect(formatCreateProgress(12.4)).toBe("Creating subtitles… 12%");
    expect(formatRemaining(45)).toBe("~45s left");
    expect(formatRemaining(180)).toBe("~3 min left");
    expect(formatCreateProgress(62, 45)).toBe("Creating subtitles… 62% · ~45s left");
    expect(remainingTranscribeSeconds({ completedWindows: 0, totalWindows: 5, elapsedMs: 10_000 })).toBeNull();
    expect(remainingTranscribeSeconds({ completedWindows: 5, totalWindows: 5, elapsedMs: 10_000 })).toBeNull();
    expect(
      remainingTranscribeSeconds({ completedWindows: 1, totalWindows: 5, elapsedMs: 10_000 })
    ).toBe(40);
    expect(
      remainingTranscribeSeconds({
        completedWindows: 2,
        totalWindows: 5,
        elapsedMs: 40_000,
        firstWindowMs: 30_000
      })
    ).toBe(30);
    expect(monotonicPercent(40, 12)).toBe(40);
    expect(monotonicPercent(40, 55.9)).toBe(56);
    const files = new Map<string, { loaded: number; total: number }>();
    expect(mergeFileProgress(files, { file: "a", loaded: 50, total: 100 })).toBe(0.5);
    expect(mergeFileProgress(files, { file: "b", status: "done", total: 100 })).toBe(0.75);
    expect(loadStagePercent(0)).toBe(20);
    expect(loadStagePercent(1)).toBe(55);
    expect(transcribeStagePercent(0, 4)).toBe(58);
    expect(transcribeStagePercent(2, 4)).toBe(76);
  });

  it("ticks an estimate while transcription is running", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const stop = startEstimate(58, 94, 5, (percent) => ticks.push(percent), {
      setInterval,
      clearInterval
    });
    vi.advanceTimersByTime(1000);
    stop();
    vi.useRealTimers();
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBeGreaterThan(58);
    expect(ticks.at(-1)).toBeLessThan(94);
  });
});

describe("transcriber runtime files", () => {
  it("downloads transformers and onnx wasm, and ffmpeg for this computer", () => {
    const files = transcriberLibFiles();
    expect(files.some((file) => file.url.includes(`@huggingface/transformers@${TRANSFORMERS_VERSION}`))).toBe(true);
    expect(files.some((file) => file.url.includes(`onnxruntime-web@${ONNXRUNTIME_WEB_VERSION}`) && file.name.endsWith(".wasm"))).toBe(true);
    expect(whisperModelId("tiny")).toBe("Xenova/whisper-tiny");
    expect(whisperModelId("large")).toBe("Xenova/whisper-large-v3");
    const ffmpeg = ffmpegAsset("darwin", "arm64");
    expect(ffmpeg?.url).toBe(`https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-darwin-arm64.gz`);
    expect(ffmpegAsset("win32", "x64")?.binary).toBe("ffmpeg.exe");
    expect(ffmpegAsset("sunos", "x64")).toBeNull();
    expect(inferenceDevice()).toBe("wasm");
    expect(forceWebOnnxSource('vA=bA&&process?.release?.name==="node"&&!Ic')).toBe("vA=bA&&false&&!Ic");
    expect(
      forceWebOnnxSource('m=globalThis.process?.versions?.node&&"renderer"!=globalThis.process?.type')
    ).toBe("m=false");
    expect(
      forceWebOnnxSource("var isNode=globalThis.process?.versions?.node&&globalThis.process?.type!=\"renderer\"")
    ).toBe("var isNode=false");
  });

  it("deletes the whole transcriber unless keep is on", () => {
    expect(transcriberCleanupPath("/plugin/transcriber", false)).toBe("/plugin/transcriber");
    expect(transcriberCleanupPath("/plugin/transcriber/", true)).toBe("/plugin/transcriber/tmp");
  });
});

describe("audio helpers", () => {
  it("mixes, resamples, reads wav PCM, and maps Whisper chunks to cues", () => {
    const buffer = {
      length: 2,
      numberOfChannels: 2,
      getChannelData: (channel: number) => (channel === 0 ? new Float32Array([1, 0]) : new Float32Array([0, 1]))
    } as unknown as AudioBuffer;
    expect(Array.from(mixToMono(buffer))).toEqual([0.5, 0.5]);
    expect(resampleLinear(new Float32Array([0, 1]), 2, 4).length).toBe(4);
    const wav = pcm16Wav(new Int16Array([0, 16384, -16384, 0]));
    const pcm = readWavPcm(wav);
    expect(pcm.length).toBe(4);
    expect(pcm[1]).toBeGreaterThan(0.4);
    expect(chunksToCues([
      { text: " hello ", timestamp: [0, 1.5] },
      { text: " ", timestamp: [1.5, 2] },
      { text: "skip", timestamp: [3, null] }
    ])).toEqual([{ start: 0, end: 1.5, text: "hello" }]);
    const short = pcmWindows(new Float32Array(5 * WHISPER_SAMPLE_RATE));
    expect(short).toHaveLength(1);
    expect(short[0]?.offsetSec).toBe(0);
    const long = pcmWindows(new Float32Array(50 * WHISPER_SAMPLE_RATE));
    expect(long.length).toBeGreaterThan(1);
    expect(long[1]?.offsetSec).toBeGreaterThan(0);
    const merged: { start: number; end: number; text: string }[] = [];
    appendWindowCues(merged, [{ start: 0, end: 30, text: "a" }]);
    appendWindowCues(merged, [{ start: 20, end: 50, text: "b" }]);
    expect(merged).toEqual([
      { start: 0, end: 30, text: "a" },
      { start: 30, end: 50, text: "b" }
    ]);
  });
});
