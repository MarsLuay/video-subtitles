import { describe, expect, it } from "vitest";
import { buildSubtitleMenuRows, playbackSpeedLabel } from "../src/ui/menuModel";
import { DEBUG_SHOW_OVERFLOW_HIT, isOverflowButtonHit, measureOverflowHit, overflowControlsVisible } from "../src/ui/overflowButton";

describe("player overflow 3-dot", () => {
  it("keeps the overflow hit box invisible", () => {
    expect(DEBUG_SHOW_OVERFLOW_HIT).toBe(false);
  });

  it("hits the native overflow button at the bottom-right of the control bar", () => {
    const bounds = { width: 640, height: 360, left: 10, top: 20 };
    // 48×48, right 0, bottom 24 → video-local [592,288]–[640,336], client [602,308]–[650,356]
    expect(isOverflowButtonHit(bounds, 630, 330)).toBe(true);
    expect(isOverflowButtonHit(bounds, 649, 355)).toBe(true);
    expect(isOverflowButtonHit(bounds, 640, 370)).toBe(false);
    expect(isOverflowButtonHit(bounds, 500, 330)).toBe(false);
    expect(isOverflowButtonHit(bounds, 640, 200)).toBe(false);
  });

  it("only steals that click while Chromium controls are showing", () => {
    expect(overflowControlsVisible(true, false)).toBe(true);
    expect(overflowControlsVisible(false, true)).toBe(true);
    expect(overflowControlsVisible(false, false)).toBe(false);
  });

  it("uses the public overflow-button pseudo size when Chromium exposes it", () => {
    const video = document.createElement("video");
    const original = window.getComputedStyle.bind(window);
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (pseudo === "::-webkit-media-controls-overflow-button") {
        return {
          width: "36px",
          height: "36px",
          marginRight: "4px",
          marginBottom: "2px",
          right: "auto",
          bottom: "auto"
        } as CSSStyleDeclaration;
      }
      if (pseudo === "::-webkit-media-controls-enclosure") {
        return { paddingRight: "5px", paddingBottom: "5px" } as CSSStyleDeclaration;
      }
      return original(el, pseudo);
    }) as typeof window.getComputedStyle;
    try {
      expect(measureOverflowHit(video)).toEqual({
        width: 36,
        height: 36,
        right: 4,
        bottom: 2
      });
    } finally {
      window.getComputedStyle = original;
    }
  });

  it("falls back to Chromium's 48px overflow button when the pseudo has no size", () => {
    const video = document.createElement("video");
    expect(measureOverflowHit(video)).toEqual({
      width: 48,
      height: 48,
      right: 0,
      bottom: 24
    });
  });

  it("ignores overflow-button styles that copy the video host box", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "clientWidth", { configurable: true, value: 960 });
    Object.defineProperty(video, "clientHeight", { configurable: true, value: 540 });
    const original = window.getComputedStyle.bind(window);
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (
        pseudo === "::-webkit-media-controls-overflow-button" ||
        pseudo === "::-internal-media-controls-overflow-button"
      ) {
        return { width: "960px", height: "540px", marginRight: "0px", marginBottom: "0px", right: "auto", bottom: "auto" } as CSSStyleDeclaration;
      }
      return original(el, pseudo);
    }) as typeof window.getComputedStyle;
    try {
      expect(measureOverflowHit(video)).toEqual({
        width: 48,
        height: 48,
        right: 0,
        bottom: 24
      });
    } finally {
      window.getComputedStyle = original;
    }
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

  it("shows Off, Create, and Import when no tracks are loaded", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [],
      activeTrackId: null
    });
    expect(rows.find((row) => row.kind === "off")).toEqual({ kind: "off", checked: true });
    expect(rows.map((row) => row.kind).slice(-2)).toEqual(["create", "import"]);
    expect(rows.filter((row) => row.kind === "track")).toHaveLength(0);
  });

  it("lists an imported track after Off and before Create and Import", () => {
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
      "create",
      "import"
    ]);
    expect(rows[4]).toEqual({ kind: "off", checked: false });
    expect(rows[5]).toEqual({ kind: "track", id: "sub-1", label: "lecture", checked: true });
  });
});
