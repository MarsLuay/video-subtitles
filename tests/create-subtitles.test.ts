import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { lastSettingButtonClick } from "./mocks/obsidian";
import {
  appendWindowCues,
  chunksToCues,
  mixToMono,
  pcmWindows,
  readWavPcm,
  resampleLinear,
  shiftCues,
  slicePcm,
  WHISPER_SAMPLE_RATE
} from "../src/transcribe/audio";
import { ffmpegAsset, FFMPEG_RELEASE } from "../src/transcribe/ffmpeg";
import { pickAccuracyForHardware, pickWasmThreads } from "../src/transcribe/hardware";
import { fileCache, modelCachePath } from "../src/transcribe/cache";
import {
  forceWebOnnxSource,
  inferenceDevice,
  ONNXRUNTIME_WEB_VERSION,
  ONNX_WASM_PROXY,
  onnxWasmThreads,
  TRANSFORMERS_VERSION,
  transcriberLibFiles
} from "../src/transcribe/lib";
import { whisperModelId } from "../src/transcribe/models";
import {
  bumpJobs,
  formatBatchCurrent,
  formatBatchOverall,
  formatBatchResult,
  idleQueueSnapshot,
  isEncryptedVaultPath,
  overallProgressPercent,
  overallRemainingSec,
  vaultVideoFiles
} from "../src/transcribe/batch";
import { containedPath } from "../src/transcribe/containedFs";
import { shouldRemoveTranscriberOnUnload, transcriberCleanupPath } from "../src/transcribe/runtime";
import {
  formatCreateProgress,
  formatRemaining,
  loadStagePercent,
  mergeFileProgress,
  monotonicPercent,
  processedDurationSec,
  remainingTranscribeSeconds,
  startEstimate,
  transcribeStagePercent,
  videoProgressPercent
} from "../src/transcribe/progress";
import { labelSpeakers, prefixSpeaker } from "../src/transcribe/diarize";
import { createResumeJob, parseResumeState, resumeMatches } from "../src/transcribe/resume";
import {
  formatClockTime,
  normalizeTranscribeRange,
  parseClockTime,
  parseCreateRange,
  videoDurationSec
} from "../src/transcribe/range";
import { spliceGeneratedTrack, upsertGeneratedTrack } from "../src/subtitles/generatedTrack";
import { emptyStore } from "../src/subtitles/store";
import { VideoSubtitlesSettingTab, type SettingsHost } from "../src/settingsTab";
import { paintBatchProgress } from "../src/ui/batchProgress";
import { BatchProgressDock } from "../src/ui/batchProgressDock";
import {
  ACCURACY_LABELS,
  DEFAULT_CUE_OPACITY,
  DEFAULT_SETTINGS,
  GENERATED_TRACK_LABEL,
  LANGUAGE_LABELS,
  MAX_SPEAKERS,
  clampCueOpacity,
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
    expect(DEFAULT_SETTINGS.chooseCreateRange).toBe(false);
    expect(DEFAULT_SETTINGS.transparentBackground).toBe(true);
    expect(DEFAULT_SETTINGS.cueOpacity).toBe(DEFAULT_CUE_OPACITY);
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
      maxSpeakers: 2,
      chooseCreateRange: false,
      transparentBackground: true,
      cueOpacity: 100
    });
    expect(mergeSettings({ transparentBackground: false, cueOpacity: 40 }).transparentBackground).toBe(false);
    expect(mergeSettings({ cueOpacity: 40 }).cueOpacity).toBe(40);
    expect(clampCueOpacity(-10)).toBe(0);
    expect(clampCueOpacity(140)).toBe(100);
    expect(clampCueOpacity("nope")).toBe(100);
    expect(mergeSettings({ chooseCreateRange: true }).chooseCreateRange).toBe(true);
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
      saveSettings: () => Promise.resolve(),
      createQueue: { running: false, snapshot: idleQueueSnapshot, subscribe: () => () => undefined, start: () => undefined, prioritize: () => "queued" },
      applyGenerated: () => Promise.resolve(false)
    } as unknown as SettingsHost;
    const tab = new VideoSubtitlesSettingTab(host.app, host);
    expect(tab.getSettingDefinitions().map((def) => def.name)).toEqual([
      "Transparent background",
      "Text opacity",
      "Keep transcriber",
      "Choose Create range",
      "Transcriber accuracy",
      "Language",
      "Translate to English",
      "Word timestamps",
      "Diarization",
      "Max speakers",
      "Process all videos"
    ]);
    tab.display();
    expect(tab.containerEl.querySelector(".video-subtitles-setting-hidden")).toBeNull();
    host.subtitleSettings.transparentBackground = false;
    tab.display();
    expect(tab.containerEl.querySelector(".video-subtitles-setting-hidden")).not.toBeNull();
  });

  it("starts process all from settings and paints live progress there", async () => {
    const start = vi.fn();
    const file = new TFile();
    file.path = "talk.mp4";
    file.name = "talk.mp4";
    file.extension = "mp4";
    const snapshot = {
      ...idleQueueSnapshot(),
      running: true,
      total: 1,
      currentName: "talk.mp4",
      currentPercent: 12,
      overallPercent: 12
    };
    const host = {
      app: {
        workspace: { containerEl: document.createElement("div") },
        vault: { getFiles: () => [file] }
      },
      subtitleSettings: { ...DEFAULT_SETTINGS, accuracyInitialized: true } satisfies VideoSubtitleSettings,
      saveSettings: () => Promise.resolve(),
      createQueue: {
        running: false,
        snapshot: () => snapshot,
        subscribe: () => () => undefined,
        start,
        prioritize: () => "queued"
      },
      applyGenerated: () => Promise.resolve(false)
    } as unknown as SettingsHost;
    const tab = new VideoSubtitlesSettingTab(host.app, host);
    tab.display();
    expect(tab.containerEl.textContent).toContain("All videos");
    expect(tab.containerEl.textContent).toContain("talk.mp4");
    await lastSettingButtonClick?.();
    expect(start).toHaveBeenCalledWith([file], true);
  });

  it("keeps process-all meters on the workspace after settings close", () => {
    const snapshot = {
      ...idleQueueSnapshot(),
      running: true,
      total: 2,
      completed: 0,
      currentName: "talk.mp4",
      currentPercent: 12,
      overallPercent: 6
    };
    const workspace = { containerEl: document.createElement("div") };
    let notify = (): void => undefined;
    const host = {
      app: { workspace },
      createQueue: {
        snapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          notify = listener;
          return () => undefined;
        }
      }
    } as unknown as SettingsHost;
    const dock = new BatchProgressDock(host);
    dock.onload();
    notify();
    expect(workspace.containerEl.textContent).toContain("All videos");
    expect(workspace.containerEl.textContent).toContain("talk.mp4");
    expect(workspace.containerEl.querySelector(".video-subtitles-batch-dock-hidden")).toBeNull();
    snapshot.running = false;
    notify();
    expect(workspace.containerEl.querySelector(".video-subtitles-batch-dock-hidden")).not.toBeNull();
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
      settings: DEFAULT_SETTINGS,
      range: null
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
    const legacy = { ...saved, version: 2 };
    delete (legacy as { rangeStartMs?: number }).rangeStartMs;
    delete (legacy as { rangeEndMs?: number }).rangeEndMs;
    expect(resumeMatches(legacy, job)).toBe(true);
    expect(resumeMatches({ ...saved, transcriberAccuracy: "tiny" }, job)).toBe(false);
    expect(resumeMatches({ ...saved, transcriberLanguage: "fr" }, job)).toBe(false);
    expect(resumeMatches({ ...saved, pcmLength: 16 }, job)).toBe(false);
    expect(resumeMatches({ ...saved, nextWindow: 5 }, job)).toBe(false);
    expect(resumeMatches({ ...saved, nextWindow: 4 }, job)).toBe(true);
    expect(parseResumeState({ ...saved, cues: [{ start: 0 }] })).toBeNull();
    const ranged = createResumeJob({
      videoPath: "/vault/clip.mp4",
      pcmLength: 48_000,
      windowCount: 4,
      settings: DEFAULT_SETTINGS,
      range: { startSec: 10, endSec: 20 }
    });
    expect(resumeMatches({ ...ranged, nextWindow: 0, cues: [], fallback: "" }, job)).toBe(false);
    expect(ranged.rangeStartMs).toBe(10_000);
    expect(ranged.rangeEndMs).toBe(20_000);
  });
});

describe("hardware accuracy pick", () => {
  it("picks a Whisper size from RAM and Apple silicon only on first run logic", () => {
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(8), cpuCount: 4, cpuModel: "Intel" })).toBe("tiny");
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(12), cpuCount: 4, cpuModel: "Intel" })).toBe("base");
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(16), cpuCount: 8, cpuModel: "Intel" })).toBe("base");
    expect(pickAccuracyForHardware({ platform: "darwin", arch: "arm64", totalmem: gb(16), cpuCount: 10, cpuModel: "Apple M4" })).toBe("small");
    expect(pickAccuracyForHardware({ platform: "linux", arch: "x64", totalmem: gb(24), cpuCount: 8, cpuModel: "AMD" })).toBe("small");
    expect(pickAccuracyForHardware({ platform: "darwin", arch: "arm64", totalmem: gb(32), cpuCount: 12, cpuModel: "Apple M4" })).toBe("medium");
    expect(pickAccuracyForHardware({ platform: "darwin", arch: "arm64", totalmem: gb(64), cpuCount: 16, cpuModel: "Apple M4 Max" })).toBe("large");
    expect(pickWasmThreads(1)).toBe(1);
    expect(pickWasmThreads(2)).toBe(2);
    expect(pickWasmThreads(8)).toBe(7);
    expect(pickWasmThreads(16)).toBe(8);
    expect(pickWasmThreads(8, false)).toBe(1);
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
    const mixed = upsertGeneratedTrack(emptyStore(), [
      { start: 0, end: 5, text: "keep" },
      { start: 10, end: 20, text: "replace" },
      { start: 30, end: 40, text: "after" }
    ]);
    expect(
      spliceGeneratedTrack(mixed, [{ start: 10, end: 15, text: "new" }], { startSec: 10, endSec: 20 }).tracks[0]?.cues
    ).toEqual([
      { start: 0, end: 5, text: "keep" },
      { start: 10, end: 15, text: "new" },
      { start: 30, end: 40, text: "after" }
    ]);
  });
});

describe("create progress", () => {
  it("formats a monotonic percent and tracks model file downloads", () => {
    expect(formatCreateProgress(12.4)).toBe("Loading transcriber… 12%");
    expect(formatCreateProgress(12.4, null, "load")).toBe("Loading transcriber… 12%");
    expect(formatCreateProgress(12.4, null, "work")).toBe("Creating subtitles… 12%/100%");
    expect(formatRemaining(45)).toBe("~45s left");
    expect(formatRemaining(180)).toBe("~3 min left");
    expect(formatCreateProgress(62, 45, "work")).toBe("Creating subtitles… 62%/100% · ~45s left");
    expect(formatCreateProgress(100, null, "work")).toBe("Creating subtitles… 100%/100%");
    expect(videoProgressPercent(12, 100)).toBe(12);
    expect(videoProgressPercent(50, 200)).toBe(25);
    expect(videoProgressPercent(200, 100)).toBe(100);
    expect(processedDurationSec([{ offsetSec: 0, samples: { length: 16_000 } }], 0)).toBe(0);
    expect(processedDurationSec([{ offsetSec: 8, samples: { length: 16_000 } }], 1)).toBe(9);
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
    expect(loadStagePercent(0)).toBe(40);
    expect(loadStagePercent(1)).toBe(100);
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

describe("contained filesystem paths", () => {
  it("keeps reads inside the transcriber root and rejects parent escape", async () => {
    const nodePath = await import("node:path");
    const win = window as unknown as { require?: (id: string) => unknown };
    const previous = win.require;
    win.require = (id: string) => {
      if (id === "path") return nodePath;
      throw new Error(id);
    };
    try {
      expect(containedPath("/plugin/transcriber", "/plugin/transcriber/lib/model.bin")).toBe(
        "/plugin/transcriber/lib/model.bin"
      );
      expect(() => containedPath("/plugin/transcriber", "/plugin/transcriber/../secrets.txt")).toThrow(
        "path escapes root"
      );
      expect(() => containedPath("/plugin/transcriber", "/plugin/transcriber-evil/x")).toThrow(
        "path escapes root"
      );
    } finally {
      if (previous) win.require = previous;
      else delete win.require;
    }
  });

  it("only stores http model files inside the models root", async () => {
    const nodePath = await import("node:path");
    const files = new Map<string, Uint8Array>();
    const win = window as unknown as { require?: (id: string) => unknown };
    const previous = win.require;
    win.require = (id: string) => {
      if (id === "path") return nodePath;
      if (id === "fs") {
        return {
          existsSync: (file: string) => files.has(file),
          statSync: () => ({ isDirectory: () => false }),
          mkdirSync: () => {},
          readFileSync: (file: string) => files.get(file) ?? new Uint8Array(),
          writeFileSync: (file: string, data: string | Uint8Array) => {
            files.set(file, typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data));
          }
        };
      }
      throw new Error(id);
    };
    try {
      const root = "/plugin/transcriber/models";
      expect(
        modelCachePath(root, "https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx")
      ).toBe("/plugin/transcriber/models/huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx");
      expect(
        modelCachePath(
          root,
          "file:///Volumes/Samsung_T5/ObsidianNotes/.obsidian/plugins/video-subtitles/transcriber/lib/ort.wasm"
        )
      ).toBeNull();
      expect(modelCachePath(root, "app://839f7b/Volumes/Samsung_T5/lib/ort.wasm")).toBeNull();
      const cache = fileCache(root);
      await cache.put(
        "https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx",
        new Response(new Uint8Array([1, 2, 3]))
      );
      await cache.put(
        "file:///Volumes/Samsung_T5/ObsidianNotes/.obsidian/plugins/video-subtitles/transcriber/lib/ort.wasm",
        new Response(new Uint8Array([9]))
      );
      const stored = [...files.keys()];
      expect(stored).toEqual([
        "/plugin/transcriber/models/huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx"
      ]);
      const hit = await cache.match(
        "https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx"
      );
      expect(hit).toBeDefined();
      expect(Array.from(new Uint8Array(await hit!.arrayBuffer()))).toEqual([1, 2, 3]);
      expect(
        await cache.match(
          "file:///Volumes/Samsung_T5/ObsidianNotes/.obsidian/plugins/video-subtitles/transcriber/lib/ort.wasm"
        )
      ).toBeUndefined();
    } finally {
      if (previous) win.require = previous;
      else delete win.require;
    }
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
    expect(ONNX_WASM_PROXY).toBe(true);
    expect(onnxWasmThreads()).toBeGreaterThanOrEqual(1);
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
    expect(shouldRemoveTranscriberOnUnload(false)).toBe(true);
    expect(shouldRemoveTranscriberOnUnload(true)).toBe(false);
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
    const ranged = new Float32Array(WHISPER_SAMPLE_RATE * 4);
    ranged[WHISPER_SAMPLE_RATE] = 1;
    const sliced = slicePcm(ranged, { startSec: 1, endSec: 3 });
    expect(sliced.length).toBe(WHISPER_SAMPLE_RATE * 2);
    expect(sliced[0]).toBe(1);
    expect(shiftCues([{ start: 0, end: 0.5, text: "hi" }], 10)).toEqual([{ start: 10, end: 10.5, text: "hi" }]);
  });
});

describe("create range", () => {
  it("parses clock times and only accepts a start before the end", () => {
    expect(parseClockTime("1:30")).toBe(90);
    expect(parseClockTime("01:02:03")).toBe(3723);
    expect(parseClockTime("90")).toBe(90);
    expect(parseClockTime("1:60")).toBeNull();
    expect(formatClockTime(90)).toBe("1:30");
    expect(formatClockTime(3723)).toBe("1:02:03");
    expect(videoDurationSec(Number.NaN)).toBeNull();
    expect(normalizeTranscribeRange(10, 20, 60)).toEqual({ startSec: 10, endSec: 20 });
    expect(normalizeTranscribeRange(20, 10, 60)).toBeNull();
    expect(normalizeTranscribeRange(0, 0.2, 60)).toBeNull();
    expect(parseCreateRange("0:10", "0:20", 60)).toEqual({ startSec: 10, endSec: 20 });
    expect(parseCreateRange("nope", "0:20", 60)).toBeNull();
  });
});

describe("process all videos", () => {
  it("queues a video to the front and skips encrypted files", () => {
    const clip = (path: string, extension = "mp4"): TFile => {
      const file = new TFile();
      file.path = path;
      file.extension = extension;
      file.name = path.split("/").pop() ?? path;
      return file;
    };
    const pending = [
      { path: "a.mp4", range: null },
      { path: "b.mp4", range: null },
      { path: "c.mp4", range: null }
    ];
    expect(bumpJobs(pending, { path: "c.mp4", range: null })).toEqual({
      pending: [
        { path: "c.mp4", range: null },
        { path: "a.mp4", range: null },
        { path: "b.mp4", range: null }
      ],
      kind: "moved"
    });
    expect(bumpJobs(pending, { path: "d.mp4", range: null }).kind).toBe("queued");
    expect(isEncryptedVaultPath("Encrypted Files/secret.mp4")).toBe(true);
    expect(isEncryptedVaultPath("clips/talk.mp4")).toBe(false);
    expect(
      vaultVideoFiles([clip("talk.mp4"), clip("notes.md", "md"), clip("Encrypted Files/hidden.mp4")]).map(
        (file) => file.path
      )
    ).toEqual(["talk.mp4"]);
    expect(overallProgressPercent(1, 4, 50)).toBe(38);
    expect(
      overallRemainingSec({
        currentRemainingSec: 20,
        queuedCount: 2,
        queuedBytes: 200,
        completedCount: 1,
        completedBytes: 100,
        completedElapsedMs: 10_000
      })
    ).toBe(40);
    expect(formatBatchOverall(1, 4, 45)).toBe("All videos… 1/4 · ~45s left");
    expect(formatBatchCurrent("talk.mp4", 12, null, "load")).toBe("talk.mp4 · Loading transcriber… 12%");
    expect(formatBatchResult(3, 0)).toBe("Added generated subtitles to 3 videos.");
    expect(formatBatchResult(1, 2)).toBe("Added generated subtitles to 1 videos. 2 failed.");
    const host = document.createElement("div");
    paintBatchProgress(host, {
      ...idleQueueSnapshot(),
      lastMessage: "Added generated subtitles to 3 videos."
    });
    expect(host.textContent).toBe("Added generated subtitles to 3 videos.");
  });
});
