import { describe, expect, it } from "vitest";
import { buildSubtitleMenuRows, playbackSpeedLabel } from "../src/ui/menuModel";
import { isOverflowButtonHit, overflowControlsVisible } from "../src/ui/overflowButton";

describe("player overflow 3-dot", () => {
  it("hits the native overflow button at the bottom-right of the control bar", () => {
    const bounds = { width: 640, height: 360, left: 10, top: 20 };
    expect(isOverflowButtonHit(bounds, 640, 370)).toBe(true);
    expect(isOverflowButtonHit(bounds, 645, 375)).toBe(true);
    expect(isOverflowButtonHit(bounds, 500, 370)).toBe(false);
    expect(isOverflowButtonHit(bounds, 640, 200)).toBe(false);
  });

  it("only steals that click while Chromium controls are showing", () => {
    expect(overflowControlsVisible(true, false)).toBe(true);
    expect(overflowControlsVisible(false, true)).toBe(true);
    expect(overflowControlsVisible(false, false)).toBe(false);
  });
});

describe("buildSubtitleMenuRows", () => {
  it("starts with Download, Playback speed, and Picture in picture", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [],
      activeTrackId: null
    });
    expect(rows.map((row) => row.kind).slice(0, 4)).toEqual([
      "download",
      "playback-speed",
      "pip",
      "separator"
    ]);
    expect(playbackSpeedLabel(1)).toBe("Normal");
    expect(playbackSpeedLabel(1.5)).toBe("1.5×");
  });

  it("shows Off and Import when no tracks are loaded", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [],
      activeTrackId: null
    });
    expect(rows.find((row) => row.kind === "off")).toEqual({ kind: "off", checked: true });
    expect(rows.some((row) => row.kind === "import")).toBe(true);
    expect(rows.filter((row) => row.kind === "track")).toHaveLength(0);
  });

  it("lists an imported track after Off and before Import", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [{ id: "sub-1", label: "lecture" }],
      activeTrackId: "sub-1"
    });
    expect(rows.map((row) => row.kind)).toEqual([
      "download",
      "playback-speed",
      "pip",
      "separator",
      "off",
      "track",
      "import"
    ]);
    expect(rows[4]).toEqual({ kind: "off", checked: false });
    expect(rows[5]).toEqual({ kind: "track", id: "sub-1", label: "lecture", checked: true });
  });
});
