import type { SubtitleCue } from "./cues";

export type SubtitleFormat = "srt" | "vtt";

const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/;

export function detectSubtitleFormat(text: string, filename = ""): SubtitleFormat {
  if (/\.vtt$/i.test(filename)) return "vtt";
  if (/\.srt$/i.test(filename)) return "srt";
  const body = text.replace(/^\uFEFF/, "").trimStart();
  return /^WEBVTT(?:\s|$)/i.test(body) ? "vtt" : "srt";
}

export function parseTimestamp(value: string): number | null {
  const match = TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const fraction = match[4] ?? "0";
  const millis = Number(fraction.padEnd(3, "0"));
  if ([hours, minutes, seconds, millis].some((part) => Number.isNaN(part))) return null;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseCueTimes(line: string): { start: number; end: number } | null {
  const arrow = line.split(/\s+-->\s+/);
  if (arrow.length < 2) return null;
  const start = parseTimestamp((arrow[0] ?? "").trim());
  const endToken = (arrow[1] ?? "").trim().split(/\s+/)[0] ?? "";
  const end = parseTimestamp(endToken);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function cueText(lines: string[]): string {
  return lines
    .map((line) => line.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[^>]+>/g, ""))
    .join("\n")
    .trim();
}

function parseBlocks(text: string, skipHeaders: boolean): SubtitleCue[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const chunks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((line) => line.trimEnd()).filter((line, index, all) => {
      if (index === 0 && line.trim() === "") return false;
      return !(index === all.length - 1 && line.trim() === "");
    });
    if (lines.length === 0) continue;
    let offset = 0;
    const first = lines[0]?.trim() ?? "";
    if (skipHeaders && (/^WEBVTT/i.test(first) || /^NOTE\b/i.test(first) || /^STYLE\b/i.test(first) || /^REGION\b/i.test(first))) {
      continue;
    }
    if (/^\d+$/.test(first) || (!first.includes("-->") && lines[1]?.includes("-->"))) {
      offset = 1;
    }
    const timeLine = lines[offset];
    if (!timeLine || !timeLine.includes("-->")) continue;
    const times = parseCueTimes(timeLine);
    if (!times) continue;
    const textLines = lines.slice(offset + 1).map((line) => line.trim());
    const text = cueText(textLines);
    if (!text) continue;
    cues.push({ start: times.start, end: times.end, text });
  }
  return cues;
}

export function parseSubtitle(text: string, filename = ""): { format: SubtitleFormat; cues: SubtitleCue[] } {
  const format = detectSubtitleFormat(text, filename);
  return { format, cues: parseBlocks(text, format === "vtt") };
}
