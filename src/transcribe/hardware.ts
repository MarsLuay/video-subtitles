import type { TranscriberAccuracy } from "../settings";

export type HardwareInfo = {
  platform: string;
  arch: string;
  totalmem: number;
  cpuModel: string;
  cpuCount: number;
};

export const MAX_WASM_THREADS = 8;

export function pickWasmThreads(cpuCount: number, canThread = true): number {
  if (!canThread) return 1;
  const n = Math.max(1, Math.floor(Number.isFinite(cpuCount) ? cpuCount : 1));
  if (n <= 2) return n;
  return Math.min(MAX_WASM_THREADS, n - 1);
}

export function wasmThreadsAvailable(): boolean {
  if (typeof SharedArrayBuffer !== "function") return false;
  try {
    return new SharedArrayBuffer(4).byteLength === 4;
  } catch {
    return false;
  }
}

export function pickAccuracyForHardware(hw: HardwareInfo): TranscriberAccuracy {
  const ramGB = hw.totalmem / (1024 * 1024 * 1024);
  const apple = hw.platform === "darwin" && (hw.arch === "arm64" || /Apple\s+M\d/i.test(hw.cpuModel));
  if (ramGB >= 64 && apple) return "large";
  if (ramGB >= 32 && apple) return "medium";
  if (ramGB >= 24) return apple ? "medium" : "small";
  if (ramGB >= 16) return apple ? "small" : "base";
  if (ramGB >= 10) return "base";
  return "tiny";
}
