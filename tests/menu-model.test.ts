import { describe, expect, it } from "vitest";
import { buildSubtitleMenuRows, isNativeSubtitleMenu } from "../src/ui/menuModel";

describe("native more-options source", () => {
  it("only attaches to the pane more-options menu", () => {
    expect(isNativeSubtitleMenu("more-options")).toBe(true);
    expect(isNativeSubtitleMenu("tab-header")).toBe(false);
    expect(isNativeSubtitleMenu("file-explorer-context-menu")).toBe(false);
  });
});

describe("buildSubtitleMenuRows", () => {
  it("shows Off and Import when no tracks are loaded", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [],
      activeTrackId: null
    });
    expect(rows[0]).toEqual({ kind: "off", checked: true });
    expect(rows.some((row) => row.kind === "import")).toBe(true);
    expect(rows.filter((row) => row.kind === "track")).toHaveLength(0);
  });

  it("lists an imported track after Off and before Import", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [{ id: "sub-1", label: "lecture" }],
      activeTrackId: "sub-1"
    });
    expect(rows.map((row) => row.kind)).toEqual(["off", "track", "import"]);
    expect(rows[0]).toEqual({ kind: "off", checked: false });
    expect(rows[1]).toEqual({ kind: "track", id: "sub-1", label: "lecture", checked: true });
  });
});
