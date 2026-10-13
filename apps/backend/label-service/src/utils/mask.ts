import { BadRequestError } from '@visin/backend-core';
import { MAX_PNG_PIXELS } from './png';

/**
 * The wire form of a mask: what the editor uploads on every autosave.
 *
 * A 1080p mask is two megabytes of class indices, almost all of it long runs of
 * one value, so the editor sends run lengths — a few hundred bytes to a few
 * kilobytes — and the server writes the PNG. That keeps PNG encoding out of the
 * browser and lets the server check the mask before it stores anything.
 *
 *     "VMSK" · version u8 (=1) · width u32le · height u32le · runs…
 *     run = value u8 · length (unsigned LEB128)
 *
 * Runs cover the image row by row; their lengths must add up to width × height.
 */
const MAGIC = Buffer.from('VMSK', 'ascii');
const VERSION = 1;
const HEADER_BYTES = 13;

export interface RawMask {
  width: number;
  height: number;
  /** one class index per pixel, row by row; 0 is unlabeled */
  data: Uint8Array;
}

export const encodeMaskRle = ({ width, height, data }: RawMask): Buffer => {
  const out: number[] = [];
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
  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header);
  header[4] = VERSION;
  header.writeUInt32LE(width, 5);
  header.writeUInt32LE(height, 9);
  return Buffer.concat([header, Buffer.from(out)]);
};

export const decodeMaskRle = (bytes: Buffer, maxPixels = MAX_PNG_PIXELS): RawMask => {
  if (bytes.length < HEADER_BYTES || !bytes.subarray(0, 4).equals(MAGIC) || bytes[4] !== VERSION) {
    throw new BadRequestError('Not a Visin mask');
  }
  const width = bytes.readUInt32LE(5);
  const height = bytes.readUInt32LE(9);
  if (width < 1 || height < 1 || width * height > maxPixels) {
    throw new BadRequestError(`A ${width}×${height} mask is outside what a frame may be`);
  }
  const data = new Uint8Array(width * height);
  let filled = 0;
  for (let pos = HEADER_BYTES; pos < bytes.length; ) {
    const value = bytes[pos++];
    let length = 0;
    let shift = 0;
    for (;;) {
      if (pos >= bytes.length || shift > 28) throw new BadRequestError('Mask run lengths are malformed');
      const byte = bytes[pos++];
      length += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    if (length < 1 || filled + length > data.length) {
      throw new BadRequestError('Mask runs do not fit the image');
    }
    data.fill(value, filled, filled + length);
    filled += length;
  }
  if (filled !== data.length) {
    throw new BadRequestError('Mask runs do not cover the image');
  }
  return { width, height, data };
};

/** How many pixels carry each class index, without the unlabeled ones. */
export const countPixels = (data: Uint8Array): Record<string, number> => {
  const counts = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i++) counts[data[i]]++;
  const pixels: Record<string, number> = {};
  for (let index = 1; index < 256; index++) {
    if (counts[index] > 0) pixels[String(index)] = counts[index];
  }
  return pixels;
};
