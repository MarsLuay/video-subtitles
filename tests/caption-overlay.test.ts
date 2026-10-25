import { describe, expect, it } from "vitest";
import { cueTextAt, labelFromFilename } from "../src/subtitles/cues";
import { applyCueAppearance, cueOverlayOpacity } from "../src/ui/captionOverlay";
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

  it("drops the black bar and uses the opacity slider when transparent is on", () => {
    const el = document.createElement("div");
    applyCueAppearance(el, { transparentBackground: true, cueOpacity: 40 });
    expect(el.classList.contains("is-transparent")).toBe(true);
    expect(el.style.getPropertyValue("--video-subtitles-cue-opacity")).toBe("0.4");
    expect(cueOverlayOpacity({ transparentBackground: true, cueOpacity: 40 })).toBe(0.4);
    applyCueAppearance(el, { transparentBackground: false, cueOpacity: 40 });
    expect(el.classList.contains("is-transparent")).toBe(false);
    expect(el.style.getPropertyValue("--video-subtitles-cue-opacity")).toBe("1");
    expect(cueOverlayOpacity({ transparentBackground: false, cueOpacity: 40 })).toBe(1);
  });

  it("uses the imported filename as the menu label", () => {
    expect(labelFromFilename("lecture.srt")).toBe("lecture");
    const rows = buildSubtitleMenuRows({
      tracks: [{ id: "a", label: labelFromFilename("lecture.srt") }],
      activeTrackId: "a"
    });
    expect(rows.some((row) => row.kind === "track" && row.label === "lecture" && row.checked)).toBe(true);
  });
});
