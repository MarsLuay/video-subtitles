export const TRANSCRIBER_ACCURACY = ["tiny", "base", "small", "medium", "large"] as const;

export type TranscriberAccuracy = (typeof TRANSCRIBER_ACCURACY)[number];

export const TRANSCRIBER_LANGUAGE = [
  "auto",
  "en",
  "es",
  "fr",
  "de",
  "zh",
  "ja",
  "ko",
  "ar",
  "pt",
  "it",
  "ru",
  "hi",
  "nl",
  "pl",
  "tr",
  "vi",
  "uk"
] as const;

export type TranscriberLanguage = (typeof TRANSCRIBER_LANGUAGE)[number];

export const MAX_SPEAKERS = [2, 3, 4] as const;

export type MaxSpeakers = (typeof MAX_SPEAKERS)[number];

export const GENERATED_TRACK_LABEL = "generated";

export interface VideoSubtitleSettings {
  keepTranscriber: boolean;
  transcriberAccuracy: TranscriberAccuracy;
  accuracyInitialized: boolean;
  transcriberLanguage: TranscriberLanguage;
  translateToEnglish: boolean;
  wordTimestamps: boolean;
  diarization: boolean;
  maxSpeakers: MaxSpeakers;
  chooseCreateRange: boolean;
  transparentBackground: boolean;
  cueOpacity: number;
}

export type CreateTranscribeSettings = Pick<
  VideoSubtitleSettings,
  | "transcriberAccuracy"
  | "transcriberLanguage"
  | "translateToEnglish"
  | "wordTimestamps"
  | "diarization"
  | "maxSpeakers"
>;

export const DEFAULT_CUE_OPACITY = 100;

export const DEFAULT_SETTINGS: VideoSubtitleSettings = {
  keepTranscriber: true,
  transcriberAccuracy: "base",
  accuracyInitialized: false,
  transcriberLanguage: "auto",
  translateToEnglish: false,
  wordTimestamps: false,
  diarization: false,
  maxSpeakers: 2,
  chooseCreateRange: false,
  transparentBackground: true,
  cueOpacity: DEFAULT_CUE_OPACITY
};

export const ACCURACY_LABELS: Record<TranscriberAccuracy, string> = {
  tiny: "Tiny (fastest)",
  base: "Base",
  small: "Small",
  medium: "Medium",
  large: "Large (slowest, most accurate)"
};

export const LANGUAGE_LABELS: Record<TranscriberLanguage, string> = {
  auto: "Auto",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  vi: "Vietnamese",
  uk: "Ukrainian"
};

export function isTranscriberAccuracy(value: unknown): value is TranscriberAccuracy {
  return typeof value === "string" && (TRANSCRIBER_ACCURACY as readonly string[]).includes(value);
}

export function isTranscriberLanguage(value: unknown): value is TranscriberLanguage {
  return typeof value === "string" && (TRANSCRIBER_LANGUAGE as readonly string[]).includes(value);
}

export function isMaxSpeakers(value: unknown): value is MaxSpeakers {
  return value === 2 || value === 3 || value === 4;
}

export function clampCueOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CUE_OPACITY;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function whisperInputOptions(settings: CreateTranscribeSettings): {
  return_timestamps: true | "word";
  language?: string;
  task?: "translate";
} {
  const options: {
    return_timestamps: true | "word";
    language?: string;
    task?: "translate";
  } = {
    return_timestamps: settings.wordTimestamps ? "word" : true
  };
  if (settings.transcriberLanguage !== "auto") options.language = settings.transcriberLanguage;
  if (settings.translateToEnglish) options.task = "translate";
  return options;
}

export function mergeSettings(raw: unknown): VideoSubtitleSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    keepTranscriber: src.keepTranscriber !== false,
    transcriberAccuracy: isTranscriberAccuracy(src.transcriberAccuracy)
      ? src.transcriberAccuracy
      : DEFAULT_SETTINGS.transcriberAccuracy,
    accuracyInitialized: src.accuracyInitialized === true,
    transcriberLanguage: isTranscriberLanguage(src.transcriberLanguage)
      ? src.transcriberLanguage
      : DEFAULT_SETTINGS.transcriberLanguage,
    translateToEnglish: src.translateToEnglish === true,
    wordTimestamps: src.wordTimestamps === true,
    diarization: src.diarization === true,
    maxSpeakers: isMaxSpeakers(src.maxSpeakers) ? src.maxSpeakers : DEFAULT_SETTINGS.maxSpeakers,
    chooseCreateRange: src.chooseCreateRange === true,
    transparentBackground: src.transparentBackground !== false,
    cueOpacity: clampCueOpacity(src.cueOpacity)
  };
}
