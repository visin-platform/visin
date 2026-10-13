import { deflateSync, inflateSync } from 'node:zlib';
import { BadRequestError } from '@visin/backend-core';
import { crc32 } from './crc32';

/**
 * Just enough PNG for label masks: non-interlaced, 8-bit (or packed 1/2/4-bit
 * palette/grayscale) images in, one byte per pixel out.
 *
 * A mask is a class index per pixel, so the only encoder needed writes grayscale
 * or palette images, and the decoder has to read what other tools produce —
 * palette masks from Pascal VOC, RGB masks from CVAT. Writing it here keeps
 * label-service free of an image dependency it would otherwise have to carry in
 * its own lockfile.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decoding allocates width × height bytes, so a header that claims more is refused up front. */
export const MAX_PNG_PIXELS = 64 * 1024 * 1024;

const chunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

const encode = (width: number, height: number, data: Uint8Array, colorType: 0 | 3, palette?: Buffer): Buffer => {
  if (data.length !== width * height) {
    throw new Error(`PNG data is ${data.length} bytes, expected ${width * height}`);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = colorType;
  // compression, filter and interlace methods stay 0
  const raw = Buffer.alloc((width + 1) * height); // each row starts with filter type 0 (none)
  for (let y = 0; y < height; y++) {
    Buffer.from(data.buffer, data.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    ...(palette ? [chunk('PLTE', palette)] : []),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

/** 8-bit grayscale: the pixel value is the class index, which is how a mask is stored. */
export const encodeGrayscalePng = (width: number, height: number, data: Uint8Array): Buffer =>
  encode(width, height, data, 0);

/** 8-bit palette: the pixel value is the class index and the palette gives each one a colour. */
export const encodePalettePng = (
  width: number,
  height: number,
  data: Uint8Array,
  palette: [number, number, number][]
): Buffer => encode(width, height, data, 3, Buffer.from(palette.slice(0, 256).flat()));

export interface DecodedPng {
  width: number;
  height: number;
  /** 0 grayscale, 2 RGB, 3 palette, 4 grayscale+alpha, 6 RGBA */
  colorType: number;
  /** bytes per pixel in `data` */
  channels: number;
  data: Uint8Array;
  /** colour table of a palette image, `[r, g, b][]` */
  palette?: [number, number, number][];
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Reads width and height from the header without inflating anything. */
export const readPngSize = (png: Buffer): { width: number; height: number } => {
  if (png.length < 33 || !png.subarray(0, 8).equals(SIGNATURE)) {
    throw new BadRequestError('Not a PNG file');
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

export const decodePng = (png: Buffer, maxPixels = MAX_PNG_PIXELS): DecodedPng => {
  const { width, height } = readPngSize(png);
  if (width < 1 || height < 1 || width * height > maxPixels) {
    throw new BadRequestError(`PNG is ${width}×${height}, which is outside what a mask may be`);
  }
  const bitDepth = png[24];
  const colorType = png[25];
  const interlace = png[28];
  const channels = CHANNELS[colorType];
  if (!channels || interlace !== 0) {
    throw new BadRequestError('Only non-interlaced grayscale, RGB, palette and alpha PNGs are supported');
  }
  const packed = bitDepth < 8;
  if (bitDepth !== 8 && !(packed && (colorType === 0 || colorType === 3))) {
    throw new BadRequestError(`Unsupported PNG bit depth ${bitDepth} for colour type ${colorType}`);
  }

  const idat: Buffer[] = [];
  let palette: [number, number, number][] | undefined;
  for (let pos = 8; pos + 8 <= png.length; ) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IDAT') idat.push(body);
    else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i + 2 < body.length; i += 3) palette.push([body[i], body[i + 1], body[i + 2]]);
    } else if (type === 'IEND') break;
    pos += 12 + length;
  }

  const bitsPerPixel = channels * bitDepth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const step = Math.max(1, bitsPerPixel >> 3); // bytes to the left neighbour, 1 for packed rows
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: (rowBytes + 1) * height });
  } catch {
    throw new BadRequestError('PNG image data is corrupt');
  }
  if (raw.length < (rowBytes + 1) * height) {
    throw new BadRequestError('PNG image data is truncated');
  }

  const pixels = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)];
    const src = y * (rowBytes + 1) + 1;
    const dst = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= step ? pixels[dst + x - step] : 0;
      const up = y > 0 ? pixels[dst - rowBytes + x] : 0;
      const upLeft = y > 0 && x >= step ? pixels[dst - rowBytes + x - step] : 0;
      const value = raw[src + x];
      switch (filter) {
        case 0: pixels[dst + x] = value; break;
        case 1: pixels[dst + x] = value + left; break;
        case 2: pixels[dst + x] = value + up; break;
        case 3: pixels[dst + x] = value + ((left + up) >> 1); break;
        case 4: pixels[dst + x] = value + paeth(left, up, upLeft); break;
        default: throw new BadRequestError('PNG uses an unknown row filter');
      }
    }
  }

  if (!packed) return { width, height, colorType, channels, data: pixels, ...(palette ? { palette } : {}) };

  // 1, 2 and 4-bit rows: unpack to one byte per pixel, high bits first.
  const data = new Uint8Array(width * height);
  const mask = (1 << bitDepth) - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = x * bitDepth;
      data[y * width + x] = (pixels[y * rowBytes + (bit >> 3)] >> (8 - bitDepth - (bit & 7))) & mask;
    }
  }
  return { width, height, colorType, channels: 1, data, ...(palette ? { palette } : {}) };
};
