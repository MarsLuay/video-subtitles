import { downloadFile, existsFile } from "./download";
import { nodeRequire } from "./node";
import { fileCache } from "./cache";
import { whisperInputOptions, type CreateTranscribeSettings } from "../settings";
import { whisperModelId } from "./models";
import type { SubtitleCue } from "../subtitles/cues";
import { appendWindowCues, chunksToCues, pcmWindows } from "./audio";
import { labelSpeakers } from "./diarize";
import type { TranscribePcmResume } from "./resume";
import {
  loadStagePercent,
  mergeFileProgress,
  processedDurationSec,
  remainingTranscribeSeconds,
  videoProgressPercent,
  yieldToTracker,
  type CreateProgressFn,
  type ProgressEvent
} from "./progress";

export const TRANSFORMERS_VERSION = "4.3.1";
export const ONNXRUNTIME_WEB_VERSION = "1.31.0-dev.20260914-8d85527a0";

type OnnxWasmEnv = {
  wasmPaths?: { mjs?: string; wasm?: string } | string;
  proxy?: boolean;
  numThreads?: number;
};

type TransformersModule = {
  env: {
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    useFSCache: boolean;
    useCustomCache: boolean;
    customCache: ReturnType<typeof fileCache> | null;
    backends: { onnx: { wasm?: OnnxWasmEnv } };
  };
  pipeline: (
    task: "automatic-speech-recognition",
    model: string,
    options?: Record<string, unknown>
  ) => Promise<{
    (
      audio: Float32Array,
      options?: Record<string, unknown>
    ): Promise<{ text?: string; chunks?: { text?: string; timestamp?: [number | null, number | null] }[] }>;
    dispose?: () => Promise<void>;
  }>;
};

export function transcriberLibFiles(): readonly { url: string; name: string }[] {
  const wasm = "ort-wasm-simd-threaded.asyncify";
  const ort = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNXRUNTIME_WEB_VERSION}/dist`;
  return [
    {
      url: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`,
      name: "transformers.min.js"
    },
    { url: `${ort}/${wasm}.mjs`, name: `${wasm}.mjs` },
    { url: `${ort}/${wasm}.wasm`, name: `${wasm}.wasm` }
  ];
}

export async function ensureTranscriberLib(libDir: string): Promise<void> {
  const fs = nodeRequire<typeof import("fs")>("fs");
  fs.mkdirSync(libDir, { recursive: true });
  const path = nodeRequire<typeof import("path")>("path");
  await Promise.all(
    transcriberLibFiles().map(async (file) => {
      const dest = path.join(libDir, file.name);
      if (!existsFile(dest)) await downloadFile(file.url, dest);
    })
  );
  patchWebOnnxFile(path.join(libDir, "transformers.min.js"));
  patchWebOnnxFile(path.join(libDir, "ort-wasm-simd-threaded.asyncify.mjs"));
}

export function inferenceDevice(): "wasm" {
  return "wasm";
}

export const WEB_ONNX_IMPORT = "vs-web-onnx";

export function forceWebOnnxSource(source: string): string {
  return source
    .replaceAll('process?.release?.name==="node"', "false")
    .replaceAll('globalThis.process?.versions?.node&&"renderer"!=globalThis.process?.type', "false")
    .replaceAll("globalThis.process?.versions?.node&&globalThis.process?.type!=\"renderer\"", "false");
}

function patchWebOnnxFile(absPath: string): void {
  const fs = nodeRequire<typeof import("fs")>("fs");
  if (!existsFile(absPath)) return;
  const src = fs.readFileSync(absPath, "utf8");
  const next = forceWebOnnxSource(src);
  if (next !== src) fs.writeFileSync(absPath, next);
}

function clearOnnxRuntimeGlobal(): void {
  const key = Symbol.for("onnxruntime");
  const g = window as typeof window & Record<symbol, unknown>;
  if (!(key in g)) return;
  try {
    delete g[key];
  } catch {
    g[key] = undefined;
  }
}

function withBrowserProcessRelease<T>(run: () => Promise<T>): Promise<T> {
  const proc = (window as unknown as { process?: { release?: { name?: string } } }).process;
  if (!proc?.release || proc.release.name !== "node") return run();
  const original = proc.release;
  try {
    Object.defineProperty(proc, "release", { configurable: true, enumerable: true, value: { name: "browser" } });
  } catch {
    try {
      proc.release = { name: "browser" };
    } catch {
      return run();
    }
  }
  return run().finally(() => {
    try {
      Object.defineProperty(proc, "release", { configurable: true, enumerable: true, value: original });
    } catch {
      try {
        proc.release = original;
      } catch {
        /* keep the transcriber import from blocking restore */
      }
    }
  });
}

function importEsm(specifier: string): Promise<TransformersModule> {
  if (!/^(blob:|file:|app:|https?:)/.test(specifier)) throw new Error("Unexpected transcriber module URL");
  return import(specifier) as Promise<TransformersModule>;
}

function importTransformers(jsUrl: string): Promise<TransformersModule> {
  clearOnnxRuntimeGlobal();
  const hashed = jsUrl.includes("#") ? jsUrl : `${jsUrl}#${WEB_ONNX_IMPORT}`;
  return withBrowserProcessRelease(() => importEsm(hashed));
}

function applyWasmPaths(
  transformers: TransformersModule,
  paths: { mjs: string; wasm: string },
  proxy: boolean
): void {
  const targets: { wasm?: OnnxWasmEnv }[] = [transformers.env.backends.onnx];
  const globalOrt = (window as unknown as { ort?: { env?: { wasm?: OnnxWasmEnv } } }).ort?.env;
  if (globalOrt) targets.push(globalOrt);
  for (const target of targets) {
    if (!target.wasm) target.wasm = {};
    target.wasm.proxy = proxy;
    target.wasm.numThreads = 1;
    target.wasm.wasmPaths = paths;
  }
}

export async function transcribePcm(
  pcm: Float32Array,
  settings: CreateTranscribeSettings,
  libDir: string,
  modelsDir: string,
  toUrl: (absPath: string) => string,
  onProgress?: CreateProgressFn,
  resume: TranscribePcmResume = {}
): Promise<SubtitleCue[]> {
  const duration = pcm.length / 16_000;
  const windows = pcmWindows(pcm);
  const startWindow = clampStartWindow(resume.startWindow, windows.length);
  const cues: SubtitleCue[] = resume.cues ? resume.cues.map((cue) => ({ ...cue })) : [];
  let fallback = resume.fallback ?? "";
  const reportLoad = (percent: number): void => {
    onProgress?.(percent, null, "load");
  };
  const report = (completedWindows: number, remainingSec: number | null = null): void => {
    onProgress?.(
      videoProgressPercent(processedDurationSec(windows, completedWindows), duration),
      remainingSec,
      "work"
    );
  };
  const finish = async (): Promise<SubtitleCue[]> => {
    report(windows.length);
    const raw =
      cues.length > 0
        ? cues
        : fallback
          ? [{ start: 0, end: Math.max(0.5, duration), text: fallback }]
          : null;
    if (!raw) throw new Error("The transcriber returned no speech");
    if (!settings.diarization) return raw;
    await yieldToTracker();
    const labeled = labelSpeakers(pcm, raw, settings.maxSpeakers);
    report(windows.length);
    return labeled;
  };
  if (startWindow >= windows.length) return finish();
  reportLoad(20);
  const path = nodeRequire<typeof import("path")>("path");
  await ensureTranscriberLib(libDir);
  reportLoad(35);
  const jsUrl = toUrl(path.join(libDir, "transformers.min.js"));
  const wasmPaths = {
    mjs: toUrl(path.join(libDir, "ort-wasm-simd-threaded.asyncify.mjs")),
    wasm: toUrl(path.join(libDir, "ort-wasm-simd-threaded.asyncify.wasm"))
  };
  const transformers = await importTransformers(jsUrl);
  transformers.env.allowRemoteModels = true;
  transformers.env.allowLocalModels = false;
  transformers.env.useBrowserCache = false;
  transformers.env.useFSCache = false;
  transformers.env.useCustomCache = true;
  transformers.env.customCache = fileCache(modelsDir);
  applyWasmPaths(transformers, wasmPaths, true);
  reportLoad(40);
  const downloads = new Map<string, { loaded: number; total: number }>();
  const generate = whisperInputOptions(settings);
  const openAsr = (): ReturnType<TransformersModule["pipeline"]> =>
    transformers.pipeline("automatic-speech-recognition", whisperModelId(settings.transcriberAccuracy), {
      dtype: "q8",
      device: inferenceDevice(),
      progress_callback: (event: ProgressEvent) => {
        try {
          reportLoad(loadStagePercent(mergeFileProgress(downloads, event)));
        } catch {
          /* keep loading the model */
        }
      }
    });
  let asr = await openAsr().catch(async () => {
    applyWasmPaths(transformers, wasmPaths, false);
    return openAsr();
  });
  reportLoad(100);
  report(startWindow);
  await yieldToTracker();
  const transcribeStarted = Date.now();
  let firstWindowMs = 0;
  let remainingSec: number | null = null;
  const sessionTotal = windows.length - startWindow;
  try {
    for (let index = startWindow; index < windows.length; index += 1) {
      const part = windows[index];
      if (!part) continue;
      report(index, remainingSec);
      await yieldToTracker();
      let result: { text?: string; chunks?: { text?: string; timestamp?: [number | null, number | null] }[] };
      try {
        result = await asr(new Float32Array(part.samples), generate);
      } catch (error) {
        if (index !== startWindow) throw error;
        applyWasmPaths(transformers, wasmPaths, false);
        if (typeof asr.dispose === "function") await asr.dispose();
        asr = await openAsr();
        result = await asr(new Float32Array(part.samples), generate);
      }
      if (firstWindowMs === 0) firstWindowMs = Date.now() - transcribeStarted;
      remainingSec = remainingTranscribeSeconds({
        completedWindows: index - startWindow + 1,
        totalWindows: sessionTotal,
        elapsedMs: Date.now() - transcribeStarted,
        firstWindowMs
      });
      report(index + 1, remainingSec);
      const shifted = chunksToCues(result.chunks ?? []).map((cue) => ({
        start: cue.start + part.offsetSec,
        end: cue.end + part.offsetSec,
        text: cue.text
      }));
      if (shifted.length > 0) {
        appendWindowCues(cues, shifted);
      } else {
        const text = (result.text ?? "").replace(/\s+/g, " ").trim();
        if (text) {
          fallback = fallback ? `${fallback} ${text}` : text;
          appendWindowCues(cues, [
            {
              start: part.offsetSec,
              end: Math.max(part.offsetSec + 0.5, part.offsetSec + part.samples.length / 16_000),
              text
            }
          ]);
        }
      }
      try {
        await resume.onCheckpoint?.({
          nextWindow: index + 1,
          cues: cues.map((cue) => ({ ...cue })),
          fallback
        });
      } catch {
        /* keep transcribing */
      }
    }
    return finish();
  } finally {
    if (typeof asr.dispose === "function") await asr.dispose();
  }
}

function clampStartWindow(value: number | undefined, total: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(total, Math.round(value));
}
