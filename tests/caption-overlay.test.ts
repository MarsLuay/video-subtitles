import { describe, expect, it } from "vitest";
import { cueTextAt, labelFromFilename } from "../src/subtitles/cues";
import { buildSubtitleMenuRows } from "../src/ui/menuModel";

const cues = [
  { start: 1, end: 4, text: "Hello" },
  { start: 4, end: 6, text: "World" }
];

describe("caption overlay helpers", () => {
  it("shows the cue that contains currentTime and hides at the end", () => {
    expect(cueTextAt(cues, 0.9)).toBe("");
    expect(cueTextAt(cues, 1)).toBe("Hello");
    expect(cueTextAt(cues, 3.99)).toBe("Hello");
    expect(cueTextAt(cues, 4)).toBe("World");
    expect(cueTextAt(cues, 6)).toBe("");
  });

  it("uses the imported filename as the menu label", () => {
    expect(labelFromFilename("lecture.srt")).toBe("lecture");
    const rows = buildSubtitleMenuRows({
      tracks: [{ id: "a", label: labelFromFilename("lecture.srt") }],
      activeTrackId: "a",
      playbackRate: 1
    });
    expect(rows.some((row) => row.kind === "track" && row.label === "lecture" && row.checked)).toBe(true);
  });
});
