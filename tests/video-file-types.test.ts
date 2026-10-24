import { describe, expect, it } from "vitest";
import { isIsoBmffExtension, isVideoExtension, VIDEO_EXTENSIONS } from "../src/videoFileTypes";

describe("videoFileTypes", () => {
  it("matches Obsidian video extensions", () => {
    expect([...VIDEO_EXTENSIONS]).toEqual(["mp4", "webm", "ogv", "mov", "mkv"]);
    expect(isVideoExtension("MP4")).toBe(true);
    expect(isVideoExtension("pdf")).toBe(false);
  });

  it("treats mp4 and mov as ISO-BMFF", () => {
    expect(isIsoBmffExtension("mp4")).toBe(true);
    expect(isIsoBmffExtension("mov")).toBe(true);
    expect(isIsoBmffExtension("webm")).toBe(false);
  });
});
