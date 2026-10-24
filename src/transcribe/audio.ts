import type { SubtitleCue } from "../subtitles/cues";

export const WHISPER_SAMPLE_RATE = 16_000;
export const WHISPER_CHUNK_SECONDS = 12;
export const WHISPER_STRIDE_SECONDS = 2;

export function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mixed = new Float32Array(length);
  const channels = Math.max(1, buffer.numberOfChannels);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mixed[i] = (mixed[i] ?? 0) + (data[i] ?? 0) / channels;
  }
  return mixed;
}

export function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!Number.isFinite(fromRate) || fromRate <= 0) return samples;
  if (Math.abs(fromRate - toRate) < 0.5) return samples;
  const outLength = Math.max(1, Math.round(samples.length * (toRate / fromRate)));
  const out = new Float32Array(outLength);
  const scale = (samples.length - 1) / Math.max(1, outLength - 1);
  for (let i = 0; i < outLength; i += 1) {
    const src = i * scale;
    const left = Math.floor(src);
    const right = Math.min(samples.length - 1, left + 1);
    const t = src - left;
    out[i] = (samples[left] ?? 0) * (1 - t) + (samples[right] ?? 0) * t;
  }
  return out;
}

export function pcmFromAudioBuffer(buffer: AudioBuffer): Float32Array {
  return resampleLinear(mixToMono(buffer), buffer.sampleRate, WHISPER_SAMPLE_RATE);
}

type AudioDecoder = {
  decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>;
  close: () => Promise<void>;
};

type AudioDecoderCtor = new () => AudioDecoder;

export async function decodeVideoAudio(bytes: ArrayBuffer, win: Window): Promise<Float32Array | null> {
  const record = win as unknown as { AudioContext?: AudioDecoderCtor; webkitAudioContext?: AudioDecoderCtor };
  const Ctor = record.AudioContext ?? record.webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  try {
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    return pcmFromAudioBuffer(decoded);
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

export function readWavPcm(bytes: Uint8Array): Float32Array {
  if (bytes.length < 44) throw new Error("wav is too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    throw new Error("not a wav file");
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = WHISPER_SAMPLE_RATE;
  let pcm: Float32Array | null = null;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt " && size >= 16) {
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
    } else if (id === "data") {
      const block = bytes.subarray(start, start + size);
      const samples = new Int16Array(block.buffer, block.byteOffset, Math.floor(block.byteLength / 2));
      const mixed = new Float32Array(Math.floor(samples.length / Math.max(1, channels)));
      for (let i = 0; i < mixed.length; i += 1) {
        let sum = 0;
        for (let channel = 0; channel < channels; channel += 1) {
          sum += (samples[i * channels + channel] ?? 0) / 32768;
        }
        mixed[i] = sum / channels;
      }
      pcm = resampleLinear(mixed, sampleRate, WHISPER_SAMPLE_RATE);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!pcm) throw new Error("wav has no PCM data");
  return pcm;
}

export function pcmWindows(
  pcm: Float32Array,
  sampleRate = WHISPER_SAMPLE_RATE,
  chunkSec = WHISPER_CHUNK_SECONDS,
  strideSec = WHISPER_STRIDE_SECONDS
): { samples: Float32Array; offsetSec: number }[] {
  const chunk = Math.max(1, Math.round(chunkSec * sampleRate));
  const stride = Math.max(0, Math.round(strideSec * sampleRate));
  const hop = Math.max(1, chunk - 2 * stride);
  if (pcm.length <= chunk) return [{ samples: pcm, offsetSec: 0 }];
  const windows: { samples: Float32Array; offsetSec: number }[] = [];
  for (let start = 0; start < pcm.length; start += hop) {
    const end = Math.min(pcm.length, start + chunk);
    windows.push({ samples: pcm.subarray(start, end), offsetSec: start / sampleRate });
    if (end >= pcm.length) break;
  }
  return windows;
}

export function appendWindowCues(all: SubtitleCue[], next: readonly SubtitleCue[]): void {
  for (const cue of next) {
    const last = all[all.length - 1];
    if (!last) {
      all.push({ ...cue });
      continue;
    }
    if (cue.end <= last.end) continue;
    const start = Math.max(cue.start, last.end);
    if (start >= cue.end) continue;
    all.push({ start, end: cue.end, text: cue.text });
  }
}

export function chunksToCues(
  chunks: readonly { text?: string; timestamp?: [number | null, number | null] }[]
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const chunk of chunks) {
    const text = (chunk.text ?? "").replace(/\s+/g, " ").trim();
    const start = chunk.timestamp?.[0];
    const end = chunk.timestamp?.[1];
    if (!text || typeof start !== "number" || typeof end !== "number" || end <= start) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
