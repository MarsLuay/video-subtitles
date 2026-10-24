import { downloadFile, existsFile } from "./download";
import { nodeRequire } from "./node";
import { fileCache } from "./cache";
import type { TranscriberAccuracy } from "../settings";
import { whisperModelId } from "./models";
import type { SubtitleCue } from "../subtitles/cues";
import { chunksToCues } from "./audio";

export const TRANSFORMERS_VERSION = "4.3.1";
export const ONNXRUNTIME_WEB_VERSION = "1.31.0-dev.20260914-8d85527a0";

type TransformersModule = {
  env: {
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    useFSCache: boolean;
    useCustomCache: boolean;
    customCache: ReturnType<typeof fileCache> | null;
    backends: { onnx: { wasm?: { wasmPaths?: { mjs?: string; wasm?: string }; proxy?: boolean; numThreads?: number } } };
  };
  pipeline: (
    task: "automatic-speech-recognition",
    model: string,
    options?: Record<string, unknown>
  ) => Promise<{
    (
      audio: { raw: Float32Array; sampling_rate: number },
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
}

function importEsm(specifier: string): Promise<TransformersModule> {
  if (!specifier.startsWith("blob:")) throw new Error("Unexpected transcriber module URL");
  return import(specifier) as Promise<TransformersModule>;
}

export async function transcribePcm(
  pcm: Float32Array,
  accuracy: TranscriberAccuracy,
  libDir: string,
  modelsDir: string
): Promise<SubtitleCue[]> {
  const path = nodeRequire<typeof import("path")>("path");
  const fs = nodeRequire<typeof import("fs")>("fs");
  await ensureTranscriberLib(libDir);
  const blobs: string[] = [];
  const blobUrl = (file: string, type: string): string => {
    const url = URL.createObjectURL(new Blob([fs.readFileSync(file)], { type }));
    blobs.push(url);
    return url;
  };
  try {
    const transformers = await importEsm(blobUrl(path.join(libDir, "transformers.min.js"), "text/javascript"));
    transformers.env.allowRemoteModels = true;
    transformers.env.allowLocalModels = false;
    transformers.env.useBrowserCache = false;
    transformers.env.useFSCache = false;
    transformers.env.useCustomCache = true;
    transformers.env.customCache = fileCache(modelsDir);
    const wasm = transformers.env.backends.onnx.wasm ?? {};
    wasm.proxy = false;
    wasm.numThreads = 1;
    wasm.wasmPaths = {
      mjs: blobUrl(path.join(libDir, "ort-wasm-simd-threaded.asyncify.mjs"), "text/javascript"),
      wasm: blobUrl(path.join(libDir, "ort-wasm-simd-threaded.asyncify.wasm"), "application/wasm")
    };
    transformers.env.backends.onnx.wasm = wasm;
    const asr = await transformers.pipeline("automatic-speech-recognition", whisperModelId(accuracy), {
      dtype: "q8",
      device: "wasm"
    });
    try {
      const result = await asr(
        { raw: pcm, sampling_rate: 16_000 },
        {
          return_timestamps: true,
          chunk_length_s: 30,
          stride_length_s: 5
        }
      );
      const cues = chunksToCues(result.chunks ?? []);
      if (cues.length > 0) return cues;
      const text = (result.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) throw new Error("The transcriber returned no speech");
      const duration = pcm.length / 16_000;
      return [{ start: 0, end: Math.max(0.5, duration), text }];
    } finally {
      if (typeof asr.dispose === "function") await asr.dispose();
    }
  } finally {
    for (const url of blobs) URL.revokeObjectURL(url);
  }
}
