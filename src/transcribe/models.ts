import type { TranscriberAccuracy } from "../settings";

export const WHISPER_MODELS: Record<TranscriberAccuracy, string> = {
  tiny: "Xenova/whisper-tiny",
  base: "Xenova/whisper-base",
  small: "Xenova/whisper-small",
  medium: "Xenova/whisper-medium",
  large: "Xenova/whisper-large-v3"
};

export function whisperModelId(accuracy: TranscriberAccuracy): string {
  return WHISPER_MODELS[accuracy];
}
