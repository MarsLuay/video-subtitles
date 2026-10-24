export const TRANSCRIBER_ACCURACY = ["tiny", "base", "small", "medium", "large"] as const;

export type TranscriberAccuracy = (typeof TRANSCRIBER_ACCURACY)[number];

export const GENERATED_TRACK_LABEL = "generated";

export interface VideoSubtitleSettings {
  keepTranscriber: boolean;
  transcriberAccuracy: TranscriberAccuracy;
  accuracyInitialized: boolean;
}

export const DEFAULT_SETTINGS: VideoSubtitleSettings = {
  keepTranscriber: true,
  transcriberAccuracy: "base",
  accuracyInitialized: false
};

export const ACCURACY_LABELS: Record<TranscriberAccuracy, string> = {
  tiny: "Tiny (fastest)",
  base: "Base",
  small: "Small",
  medium: "Medium",
  large: "Large (slowest, most accurate)"
};

export function isTranscriberAccuracy(value: unknown): value is TranscriberAccuracy {
  return typeof value === "string" && (TRANSCRIBER_ACCURACY as readonly string[]).includes(value);
}

export function mergeSettings(raw: unknown): VideoSubtitleSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    keepTranscriber: src.keepTranscriber !== false,
    transcriberAccuracy: isTranscriberAccuracy(src.transcriberAccuracy)
      ? src.transcriberAccuracy
      : DEFAULT_SETTINGS.transcriberAccuracy,
    accuracyInitialized: src.accuracyInitialized === true
  };
}
