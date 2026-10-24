import { concatBytes, readAscii, writeU32 } from "./bytes";

export const SUBTITLE_UUID = Uint8Array.from([
  0x6b, 0x9c, 0x1e, 0x20, 0x7d, 0x4a, 0x4f, 0x3b,
  0xa8, 0xc1, 0x2e, 0x9f, 0x0b, 0x7d, 0x4a, 0x11
]);

interface Box {
  type: string;
  start: number;
  size: number;
  headerSize: number;
  payloadStart: number;
}

function uuidEquals(bytes: Uint8Array, offset: number): boolean {
  if (offset + SUBTITLE_UUID.length > bytes.length) return false;
  for (let i = 0; i < SUBTITLE_UUID.length; i += 1) {
    if (bytes[offset + i] !== SUBTITLE_UUID[i]!) return false;
  }
  return true;
}

export function isIsoBmff(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const type = readAscii(bytes, 4, 4);
  return type === "ftyp" || type === "moov" || type === "mdat" || type === "free" || type === "wide" || type === "uuid";
}

function iterateBoxes(bytes: Uint8Array): Box[] {
  const boxes: Box[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) break;
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) break;
    boxes.push({ type, start: offset, size, headerSize, payloadStart: offset + headerSize });
    offset += size;
  }
  return boxes;
}

function isOurUuid(bytes: Uint8Array, box: Box): boolean {
  return box.type === "uuid" && uuidEquals(bytes, box.payloadStart);
}

export function readUuidPayload(bytes: Uint8Array): Uint8Array | null {
  const boxes = iterateBoxes(bytes);
  for (let i = boxes.length - 1; i >= 0; i -= 1) {
    const box = boxes[i];
    if (!box || !isOurUuid(bytes, box)) continue;
    const start = box.payloadStart + SUBTITLE_UUID.length;
    if (start > box.start + box.size) return null;
    return bytes.slice(start, box.start + box.size);
  }
  return null;
}

function encodeUuidBox(payload: Uint8Array): Uint8Array {
  const size = 8 + SUBTITLE_UUID.length + payload.byteLength;
  if (size > 0xffffffff) {
    throw new Error("subtitle payload too large for an ISO-BMFF box");
  }
  return concatBytes([
    writeU32(size),
    new Uint8Array([0x75, 0x75, 0x69, 0x64]),
    SUBTITLE_UUID,
    payload
  ]);
}

export function stripUuidPayload(bytes: Uint8Array): Uint8Array {
  const boxes = iterateBoxes(bytes);
  if (boxes.length === 0) return bytes;
  const parts: Uint8Array[] = [];
  for (const box of boxes) {
    if (isOurUuid(bytes, box)) continue;
    parts.push(bytes.subarray(box.start, box.start + box.size));
  }
  const last = boxes[boxes.length - 1];
  const consumed = last ? last.start + last.size : 0;
  if (consumed < bytes.length) {
    parts.push(bytes.subarray(consumed));
  }
  return concatBytes(parts);
}

export function writeUuidPayload(bytes: Uint8Array, payload: Uint8Array): Uint8Array {
  return concatBytes([stripUuidPayload(bytes), encodeUuidBox(payload)]);
}
