/**
 * The run-length form a mask travels in to label-service (see the backend's
 * `utils/mask.ts`, which reads it).
 *
 *     "VMSK" · version u8 (=1) · width u32le · height u32le · runs…
 *     run = value u8 · length (unsigned LEB128)
 *
 * A 1080p mask is two megabytes of class indices, almost all of it long runs of
 * one value; as runs it is a few hundred bytes to a few kilobytes, small enough
 * to send on every autosave.
 */
const HEADER_BYTES = 13;

export const encodeMaskRle = (width: number, height: number, data: Uint8Array): Uint8Array => {
  const out: number[] = [0x56, 0x4d, 0x53, 0x4b, 1]; // "VMSK", version 1
  for (const size of [width, height]) {
    out.push(size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff);
  }
  for (let i = 0; i < data.length; ) {
    const value = data[i];
    let end = i + 1;
    while (end < data.length && data[end] === value) end++;
    out.push(value);
    for (let length = end - i; ; ) {
      if (length < 0x80) {
        out.push(length);
        break;
      }
      out.push((length & 0x7f) | 0x80);
      length >>>= 7;
    }
    i = end;
  }
  return Uint8Array.from(out);
};

/** The inverse, used to restore a locally kept draft. Returns null for bytes that are not a mask. */
export const decodeMaskRle = (bytes: Uint8Array): { width: number; height: number; data: Uint8Array } | null => {
  if (bytes.length < HEADER_BYTES || bytes[0] !== 0x56 || bytes[1] !== 0x4d || bytes[2] !== 0x53 || bytes[3] !== 0x4b || bytes[4] !== 1) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(5, true);
  const height = view.getUint32(9, true);
  const data = new Uint8Array(width * height);
  let filled = 0;
  for (let pos = HEADER_BYTES; pos < bytes.length; ) {
    const value = bytes[pos++];
    let length = 0;
    let shift = 0;
    for (;;) {
      if (pos >= bytes.length || shift > 28) return null;
      const byte = bytes[pos++];
      length += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    if (length < 1 || filled + length > data.length) return null;
    data.fill(value, filled, filled + length);
    filled += length;
  }
  return filled === data.length ? { width, height, data } : null;
};
