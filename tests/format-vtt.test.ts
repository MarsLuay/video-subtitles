import { describe, expect, it } from "vitest";
import { formatVtt } from "../src/subtitles/formatVtt";
import { parseSubtitle } from "../src/subtitles/parseSubtitle";

describe("formatVtt", () => {
  it("round-trips cues through WEBVTT text", () => {
    const cues = [{ start: 1, end: 4, text: "Hello world" }];
    const parsed = parseSubtitle(formatVtt(cues), "out.vtt");
    expect(parsed.format).toBe("vtt");
    expect(parsed.cues).toEqual(cues);
  });
});
