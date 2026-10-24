import { concatBytes } from "./bytes";

export const TRAILER_MAGIC = "VSBT";
export const TRAILER_VERSION = 1;
const TRAILER_FOOTER = 12;

function magicBytes(): Uint8Array {
  return new Uint8Array([0x56, 0x53, 0x42, 0x54]);
}

function writeU32LE(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

export function readTrailerPayload(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < TRAILER_FOOTER) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magicOffset = bytes.length - 4;
  if (String.fromCharCode(...bytes.subarray(magicOffset)) !== TRAILER_MAGIC) return null;
  const version = view.getUint32(bytes.length - 8, true);
  const length = view.getUint32(bytes.length - 12, true);
  if (version !== TRAILER_VERSION) return null;
  if (length <= 0 || length > 8 * 1024 * 1024) return null;
  const start = bytes.length - TRAILER_FOOTER - length;
  if (start < 0) return null;
  return bytes.slice(start, start + length);
}

export function stripTrailerPayload(bytes: Uint8Array): Uint8Array {
  const payload = readTrailerPayload(bytes);
  if (!payload) return bytes;
  return bytes.slice(0, bytes.length - TRAILER_FOOTER - payload.byteLength);
}

export function writeTrailerPayload(bytes: Uint8Array, payload: Uint8Array): Uint8Array {
  if (payload.byteLength > 8 * 1024 * 1024) {
    throw new Error("subtitle payload too large");
  }
  const stripped = stripTrailerPayload(bytes);
  return concatBytes([
    stripped,
    payload,
    writeU32LE(payload.byteLength),
    writeU32LE(TRAILER_VERSION),
    magicBytes()
  ]);
}
