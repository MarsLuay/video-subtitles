export type TranscribeRange = {
  startSec: number;
  endSec: number;
};

export const MIN_CREATE_RANGE_SEC = 0.5;

export function parseClockTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const sec = Number(trimmed);
    return Number.isFinite(sec) && sec >= 0 ? sec : null;
  }
  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => (/^\d+(?:\.\d+)?$/.test(part) ? Number(part) : NaN));
  if (nums.some((num) => !Number.isFinite(num) || num < 0)) return null;
  if (parts.length === 2) {
    const minutes = nums[0];
    const seconds = nums[1];
    if (minutes === undefined || seconds === undefined || seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  const hours = nums[0];
  const minutes = nums[1];
  const seconds = nums[2];
  if (
    hours === undefined ||
    minutes === undefined ||
    seconds === undefined ||
    minutes >= 60 ||
    seconds >= 60
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatClockTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function videoDurationSec(duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration;
}

export function normalizeTranscribeRange(
  startSec: number,
  endSec: number,
  durationSec: number
): TranscribeRange | null {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) return null;
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
  const start = Math.max(0, startSec);
  const end = Math.min(durationSec, endSec);
  if (!(end - start >= MIN_CREATE_RANGE_SEC)) return null;
  return { startSec: start, endSec: end };
}

export function parseCreateRange(
  startText: string,
  endText: string,
  durationSec: number
): TranscribeRange | null {
  const startSec = parseClockTime(startText);
  const endSec = parseClockTime(endText);
  if (startSec == null || endSec == null) return null;
  return normalizeTranscribeRange(startSec, endSec, durationSec);
}

export function rangeToMs(range: TranscribeRange): { rangeStartMs: number; rangeEndMs: number } {
  return {
    rangeStartMs: Math.round(range.startSec * 1000),
    rangeEndMs: Math.round(range.endSec * 1000)
  };
}

export function fullRangeFromPcm(pcmLength: number, sampleRate: number): TranscribeRange {
  return { startSec: 0, endSec: pcmLength / sampleRate };
}
