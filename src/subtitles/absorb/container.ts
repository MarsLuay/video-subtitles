import { isIsoBmff, readUuidPayload, stripUuidPayload, writeUuidPayload } from "./isoBmff";
import { readTrailerPayload, stripTrailerPayload, writeTrailerPayload } from "./trailer";

export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

export function readAbsorbedPayload(bytes: Uint8Array): Uint8Array | null {
  if (isIsoBmff(bytes)) {
    const boxed = readUuidPayload(bytes);
    if (boxed) return boxed;
  }
  return readTrailerPayload(bytes);
}

export function stripAbsorbedPayload(bytes: Uint8Array): Uint8Array {
  const withoutBox = isIsoBmff(bytes) ? stripUuidPayload(bytes) : bytes;
  return stripTrailerPayload(withoutBox);
}

export function writeAbsorbedPayload(bytes: Uint8Array, payload: Uint8Array): Uint8Array {
  if (payload.byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error("subtitle payload too large");
  }
  const stripped = stripAbsorbedPayload(bytes);
  if (isIsoBmff(stripped)) return writeUuidPayload(stripped, payload);
  return writeTrailerPayload(stripped, payload);
}
