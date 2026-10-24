import { downloadFile, existsFile } from "./download";
import { nodeRequire } from "./node";
import { fileCache } from "./cache";
import type { TranscriberAccuracy } from "../settings";
import { whisperModelId } from "./models";
import type { SubtitleCue } from "../subtitles/cues";
import { chunksToCues } from "./audio";

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
  patchTransformersWebOnnx(path.join(libDir, "transformers.min.js"));
}

export function inferenceDevice(): "wasm" {
  return "wasm";
}

export const WEB_ONNX_IMPORT = "vs-web-onnx";

export function forceWebOnnxSource(source: string): string {
  return source.replaceAll('process?.release?.name==="node"', "false");
}

function patchTransformersWebOnnx(absPath: string): void {
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

function applyWasmPaths(transformers: TransformersModule, paths: { mjs: string; wasm: string }): void {
  const targets: { wasm?: OnnxWasmEnv }[] = [transformers.env.backends.onnx];
  const globalOrt = (window as unknown as { ort?: { env?: { wasm?: OnnxWasmEnv } } }).ort?.env;
  if (globalOrt) targets.push(globalOrt);
  for (const target of targets) {
    if (!target.wasm) target.wasm = {};
    target.wasm.proxy = false;
    target.wasm.numThreads = 1;
    target.wasm.wasmPaths = paths;
  }
}

export async function transcribePcm(
  pcm: Float32Array,
  accuracy: TranscriberAccuracy,
  libDir: string,
  modelsDir: string,
  toUrl: (absPath: string) => string
): Promise<SubtitleCue[]> {
  const path = nodeRequire<typeof import("path")>("path");
  await ensureTranscriberLib(libDir);
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
  applyWasmPaths(transformers, wasmPaths);
  const asr = await transformers.pipeline("automatic-speech-recognition", whisperModelId(accuracy), {
    dtype: "q8",
    device: inferenceDevice()
  });
  try {
    const result = await asr(new Float32Array(pcm), {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5
    });
    const cues = chunksToCues(result.chunks ?? []);
    if (cues.length > 0) return cues;
    const text = (result.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) throw new Error("The transcriber returned no speech");
    const duration = pcm.length / 16_000;
    return [{ start: 0, end: Math.max(0.5, duration), text }];
  } finally {
    if (typeof asr.dispose === "function") await asr.dispose();
  }
}
