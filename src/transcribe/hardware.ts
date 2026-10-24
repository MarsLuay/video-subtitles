import type { TranscriberAccuracy } from "../settings";

export type HardwareInfo = {
  platform: string;
  arch: string;
  totalmem: number;
  cpuModel: string;
};

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
