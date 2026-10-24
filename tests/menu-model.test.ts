import { describe, expect, it } from "vitest";
import { buildSubtitleMenuRows } from "../src/ui/menuModel";

describe("buildSubtitleMenuRows", () => {
  it("shows Off and Import when no tracks are loaded", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [],
      activeTrackId: null,
      playbackRate: 1
    });
    expect(rows[0]).toEqual({ kind: "off", checked: true });
    expect(rows.some((row) => row.kind === "import")).toBe(true);
    expect(rows.filter((row) => row.kind === "track")).toHaveLength(0);
  });

  it("lists an imported track after Off and before Import", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [{ id: "sub-1", label: "lecture" }],
      activeTrackId: "sub-1",
      playbackRate: 1
    });
    const kinds = rows.map((row) => row.kind);
    expect(kinds.slice(0, 3)).toEqual(["off", "track", "import"]);
    expect(rows[0]).toEqual({ kind: "off", checked: false });
    expect(rows[1]).toEqual({ kind: "track", id: "sub-1", label: "lecture", checked: true });
  });
});
