import { describe, expect, it } from "vitest";
import { concatBytes, writeU32 } from "../src/subtitles/absorb/bytes";
import { isIsoBmff, readUuidPayload, SUBTITLE_UUID } from "../src/subtitles/absorb/isoBmff";
import { readTrailerPayload, stripTrailerPayload, TRAILER_MAGIC } from "../src/subtitles/absorb/trailer";
import { readAbsorbedPayload, writeAbsorbedPayload } from "../src/subtitles/absorb/container";
import { emptyStore, loadStoreFromVideo, saveStoreToVideo, type AbsorbedStore } from "../src/subtitles/store";

function ftypBox(): Uint8Array {
  const brand = new Uint8Array([0x69, 0x73, 0x6f, 0x6d]);
  return concatBytes([
    writeU32(20),
    new Uint8Array([0x66, 0x74, 0x79, 0x70]),
    brand,
    writeU32(0),
    brand
  ]);
}

function freeBox(): Uint8Array {
  return concatBytes([writeU32(8), new Uint8Array([0x66, 0x72, 0x65, 0x65])]);
}

function minimalMp4(): Uint8Array {
  return concatBytes([ftypBox(), freeBox()]);
}

function ebmlHeader(): Uint8Array {
  return Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04]);
}

const sampleStore: AbsorbedStore = {
  version: 1,
  activeTrackId: "sub-1",
  tracks: [
    {
      id: "sub-1",
      label: "lecture",
      language: "en",
      cues: [{ start: 1, end: 2, text: "Hello" }]
    }
  ]
};

describe("ISO-BMFF uuid absorb", () => {
  it("round-trips a store without rewriting existing boxes", () => {
    const original = minimalMp4();
    const written = saveStoreToVideo(original, sampleStore);
    expect(isIsoBmff(written)).toBe(true);
    expect(written.slice(0, original.length)).toEqual(original);
    expect(readUuidPayload(written)?.byteLength).toBeGreaterThan(0);
    expect(loadStoreFromVideo(written)).toEqual(sampleStore);
  });

  it("replaces a previous uuid box instead of stacking them", () => {
    const first = saveStoreToVideo(minimalMp4(), sampleStore);
    const updated = {
      ...sampleStore,
      tracks: [
        {
          ...sampleStore.tracks[0]!,
          cues: [{ start: 3, end: 4, text: "Later" }]
        }
      ]
    };
    const second = saveStoreToVideo(first, updated);
    expect(loadStoreFromVideo(second)).toEqual(updated);
    const payload = readUuidPayload(second);
    expect(payload).not.toBeNull();
    expect(SUBTITLE_UUID.length).toBe(16);
  });
});

describe("trailer absorb", () => {
  it("round-trips a store on non-ISO files and can strip it", () => {
    const original = ebmlHeader();
    const written = saveStoreToVideo(original, sampleStore);
    expect(isIsoBmff(written)).toBe(false);
    expect(String.fromCharCode(...written.slice(-4))).toBe(TRAILER_MAGIC);
    expect(readTrailerPayload(written)?.byteLength).toBeGreaterThan(0);
    expect(loadStoreFromVideo(written)).toEqual(sampleStore);
    const stripped = stripTrailerPayload(written);
    expect(stripped).toEqual(original);
  });
});

describe("fail-open store writes", () => {
  it("keeps original bytes when encoding is skipped because tracks are empty", () => {
    const original = minimalMp4();
    expect(saveStoreToVideo(original, emptyStore())).toEqual(original);
  });

  it("reads an empty store from a video with no payload", () => {
    expect(loadStoreFromVideo(minimalMp4())).toEqual(emptyStore());
    expect(readAbsorbedPayload(minimalMp4())).toBeNull();
  });

  it("does not mutate the caller's original buffer", () => {
    const original = minimalMp4();
    const copy = original.slice();
    writeAbsorbedPayload(original, new TextEncoder().encode("{}"));
    expect(original).toEqual(copy);
  });
});
