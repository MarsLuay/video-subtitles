import { describe, expect, it } from "vitest";
import VideoSubtitlesPlugin from "../src/main";

describe("plugin", () => {
  it("exports an Obsidian Plugin subclass", () => {
    expect(typeof VideoSubtitlesPlugin).toBe("function");
    expect(VideoSubtitlesPlugin.name).toBe("VideoSubtitlesPlugin");
  });
});
