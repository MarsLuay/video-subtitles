import type { SubtitleCue } from "../subtitles/cues";
import { WHISPER_SAMPLE_RATE } from "./audio";

const FEATURE_BANDS = 8;
const KMEANS_ITERS = 8;

export function labelSpeakers(
  pcm: Float32Array,
  cues: readonly SubtitleCue[],
  maxSpeakers: number,
  sampleRate = WHISPER_SAMPLE_RATE
): SubtitleCue[] {
  if (cues.length === 0) return [];
  const k = Math.max(1, Math.min(Math.round(maxSpeakers), cues.length, 4));
  const features = cues.map((cue) => cueFeatures(pcm, cue, sampleRate));
  const speakers = remapByAppearance(kMeans(features, k));
  return cues.map((cue, index) => ({
    ...cue,
    text: prefixSpeaker(cue.text, speakers[index] ?? 1)
  }));
}

export function prefixSpeaker(text: string, speaker: number): string {
  const trimmed = text.trim();
  if (/^Speaker \d+:/i.test(trimmed)) return trimmed;
  return `Speaker ${speaker}: ${trimmed}`;
}

function cueFeatures(pcm: Float32Array, cue: SubtitleCue, sampleRate: number): number[] {
  const start = Math.max(0, Math.floor(cue.start * sampleRate));
  const end = Math.min(pcm.length, Math.floor(Math.max(cue.start, cue.end) * sampleRate));
  const count = Math.max(1, end - start);
  const bands = new Array<number>(FEATURE_BANDS).fill(0);
  let zeroCrossings = 0;
  let previous = 0;
  for (let i = 0; i < count; i += 1) {
    const sample = pcm[start + i] ?? 0;
    const band = Math.min(FEATURE_BANDS - 1, Math.floor((i / count) * FEATURE_BANDS));
    bands[band] = (bands[band] ?? 0) + sample * sample;
    if (i > 0 && (sample >= 0) !== (previous >= 0)) zeroCrossings += 1;
    previous = sample;
  }
  const bandLength = count / FEATURE_BANDS;
  return [
    ...bands.map((energy) => Math.sqrt(energy / Math.max(1, bandLength))),
    zeroCrossings / count
  ];
}

function kMeans(points: number[][], k: number): number[] {
  if (points.length === 0) return [];
  const clusterCount = Math.max(1, Math.min(k, points.length));
  if (clusterCount === 1) return points.map(() => 0);
  const dim = points[0]?.length ?? 0;
  const centroids = initialCentroids(points, clusterCount);
  let labels = points.map(() => 0);
  for (let iter = 0; iter < KMEANS_ITERS; iter += 1) {
    labels = points.map((point) => nearestCentroid(point, centroids));
    const sums = Array.from({ length: clusterCount }, () => new Array<number>(dim).fill(0));
    const counts = new Array<number>(clusterCount).fill(0);
    for (let i = 0; i < points.length; i += 1) {
      const label = labels[i] ?? 0;
      const point = points[i] ?? [];
      counts[label] = (counts[label] ?? 0) + 1;
      const sum = sums[label] ?? [];
      for (let d = 0; d < dim; d += 1) sum[d] = (sum[d] ?? 0) + (point[d] ?? 0);
    }
    for (let c = 0; c < clusterCount; c += 1) {
      const count = counts[c] ?? 0;
      if (count === 0) continue;
      centroids[c] = (sums[c] ?? []).map((sum) => sum / count);
    }
  }
  return labels;
}

function initialCentroids(points: number[][], k: number): number[][] {
  const last = Math.max(1, points.length - 1);
  const centroids: number[][] = [];
  for (let i = 0; i < k; i += 1) {
    const src = points[Math.round((i * last) / Math.max(1, k - 1))] ?? points[0] ?? [];
    centroids.push(src.slice());
  }
  return centroids;
}

function nearestCentroid(point: number[], centroids: number[][]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centroids.length; i += 1) {
    const dist = squaredDistance(point, centroids[i] ?? []);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function squaredDistance(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    sum += delta * delta;
  }
  return sum;
}

function remapByAppearance(labels: number[]): number[] {
  const map = new Map<number, number>();
  return labels.map((label) => {
    const existing = map.get(label);
    if (existing !== undefined) return existing;
    const next = map.size + 1;
    map.set(label, next);
    return next;
  });
}
