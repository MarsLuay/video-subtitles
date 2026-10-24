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

export function formatCreateProgress(percent: number): string {
  return `Creating subtitles… ${clampPercent(percent)}%`;
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
