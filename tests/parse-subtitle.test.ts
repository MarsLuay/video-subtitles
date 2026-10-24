import { describe, expect, it } from "vitest";
import { detectSubtitleFormat, parseSubtitle, parseTimestamp } from "../src/subtitles/parseSubtitle";

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:07,000
Second line
`;

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:01:02.250 --> 00:01:03.000
Later
`;

describe("parseSubtitle", () => {
  it("detects SRT and VTT", () => {
    expect(detectSubtitleFormat(SRT, "a.srt")).toBe("srt");
    expect(detectSubtitleFormat(VTT, "a.vtt")).toBe("vtt");
    expect(detectSubtitleFormat(VTT)).toBe("vtt");
  });

  it("parses SRT cues", () => {
    const { cues } = parseSubtitle(SRT, "lecture.srt");
    expect(cues).toEqual([
      { start: 1, end: 4, text: "Hello world" },
      { start: 5.5, end: 7, text: "Second line" }
    ]);
  });

  it("parses VTT cues including mm:ss timestamps", () => {
    const { cues } = parseSubtitle(VTT, "lecture.vtt");
    expect(cues[0]).toEqual({ start: 1, end: 4, text: "Hello world" });
    expect(cues[1]).toEqual({ start: 62.25, end: 63, text: "Later" });
  });

  it("parses timestamps with comma or dot millis", () => {
    expect(parseTimestamp("00:00:01,500")).toBe(1.5);
    expect(parseTimestamp("1:02:03.040")).toBe(3723.04);
    expect(parseTimestamp("01:02.250")).toBe(62.25);
  });
});
