export type ProgressEvent = {
  file?: string;
  name?: string;
  status?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(99, Math.round(value)));
}

export type CreateProgressFn = (percent: number, remainingSec?: number | null) => void;

export function formatRemaining(remainingSec?: number | null): string {
  if (remainingSec == null || !Number.isFinite(remainingSec) || remainingSec <= 0) return "";
  const sec = Math.max(1, Math.round(remainingSec));
  if (sec < 120) return `~${sec}s left`;
  return `~${Math.round(sec / 60)} min left`;
}

export function formatCreateProgress(percent: number, remainingSec?: number | null): string {
  const remaining = formatRemaining(remainingSec);
  return remaining
    ? `Creating subtitles… ${clampPercent(percent)}% · ${remaining}`
    : `Creating subtitles… ${clampPercent(percent)}%`;
}

export function remainingTranscribeSeconds(input: {
  completedWindows: number;
  totalWindows: number;
  elapsedMs: number;
  firstWindowMs?: number;
}): number | null {
  const { completedWindows, totalWindows, elapsedMs, firstWindowMs } = input;
  if (completedWindows < 1 || totalWindows <= completedWindows || elapsedMs <= 0) return null;
  const left = totalWindows - completedWindows;
  if (
    completedWindows >= 2 &&
    typeof firstWindowMs === "number" &&
    firstWindowMs >= 0 &&
    elapsedMs > firstWindowMs
  ) {
    const laterMs = elapsedMs - firstWindowMs;
    const laterCount = completedWindows - 1;
    if (laterCount > 0 && laterMs > 0) {
      return Math.max(1, Math.round((left * laterMs) / laterCount / 1000));
    }
  }
  return Math.max(1, Math.round((left * elapsedMs) / completedWindows / 1000));
}

export function monotonicPercent(current: number, next: number): number {
  return Math.max(clampPercent(current), clampPercent(next));
}

export function mergeFileProgress(
  files: Map<string, { loaded: number; total: number }>,
  event: ProgressEvent
): number {
  const key = event.file || event.name || "file";
  const prev = files.get(key) ?? { loaded: 0, total: 0 };
  let loaded = prev.loaded;
  let total = prev.total;
  if (typeof event.total === "number" && event.total > 0) total = event.total;
  if (typeof event.loaded === "number" && event.loaded >= 0) loaded = event.loaded;
  else if (typeof event.progress === "number" && Number.isFinite(event.progress)) {
    if (total <= 0) total = 100;
    loaded = (event.progress / 100) * total;
  }
  if (event.status === "done") {
    if (total <= 0) total = Math.max(loaded, 1);
    loaded = total;
  }
  files.set(key, { loaded, total: Math.max(total, loaded, 1) });
  let sumLoaded = 0;
  let sumTotal = 0;
  for (const part of files.values()) {
    sumLoaded += part.loaded;
    sumTotal += Math.max(part.total, 1);
  }
  return sumTotal > 0 ? sumLoaded / sumTotal : 0;
}

export function loadStagePercent(fraction: number): number {
  return 20 + 35 * Math.min(1, Math.max(0, fraction));
}

export const TRACKER_YIELD_MS = 250;

export function yieldToTracker(ms = TRACKER_YIELD_MS): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (typeof window.requestAnimationFrame !== "function") {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    }, ms);
  });
}

export function transcribeStagePercent(index: number, total: number): number {
  if (total <= 0) return 58;
  return 58 + (36 * index) / total;
}

export function startEstimate<T>(
  from: number,
  to: number,
  durationSec: number,
  onTick: (percent: number) => void,
  timers: {
    setInterval: (handler: () => void, ms: number) => T;
    clearInterval: (id: T) => void;
  }
): () => void {
  const span = Math.max(0, to - from);
  const estimateMs = Math.max(2500, durationSec * 1000);
  const start = Date.now();
  const id = timers.setInterval(() => {
    const t = Math.min(0.97, (Date.now() - start) / estimateMs);
    onTick(from + span * t);
  }, 200);
  return () => timers.clearInterval(id);
}
