import { crc32, deflateSync, inflateSync } from 'zlib';

/**
 * Just enough PNG to read a model's masks and confidence maps and write them back painted, on Node's own zlib.
 *
 * A PNG is a signature, then chunks (length, type, data, CRC): `IHDR` says the size and pixel format, `PLTE` holds a
 * palette, `IDAT` the pixel rows deflated together, `IEND` closes it. Each row starts with a filter byte saying how its
 * bytes were predicted from the row above and the pixel to the left; undoing that gives the samples. What image
 * libraries write for this data is read: greyscale, RGB (libvips and OpenCV often save a grey image that way), either
 * with alpha, at 8 or 16 bits, and 8-bit palette; not interlaced, which nobody uses for it. Anything else is
 * `undefined`, and the frame is shown as stored.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RGB = 2;
const PALETTE = 3;
/** Samples per pixel, by colour type: grey, RGB, palette, grey + alpha, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/**
 * More than any frame here unpacks to (a 1363×768 RGBA image at 16 bits is 8 MB). Checked before inflating, so a small
 * file whose header claims an enormous image cannot make the service allocate it.
 */
const MAX_RAW_BYTES = 64 * 1024 ** 2;

export interface GreyImage {
  width: number;
  height: number;
  /** one 8-bit value per pixel; a 16-bit sample is scaled to 8 bits, as a browser does */
  values: Uint8Array;
}

/** The filter's prediction from the pixel to the left (a), above (b) and above-left (c). */
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Undo each row's filter in place, leaving the raw bytes of every row. */
function unfilter(data: Buffer, stride: number, height: number, bytesPerPixel: number): Buffer | undefined {
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = data[y * (stride + 1)];
    if (filter > 4) return undefined;
    const line = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? out.subarray((y - 1) * stride, y * stride) : undefined;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const b = above ? above[x] : 0;
      let predicted: number;
      switch (filter) {
        case 0: predicted = 0; break;
        case 1: predicted = a; break;
        case 2: predicted = b; break;
        case 3: predicted = (a + b) >> 1; break;
        default: predicted = paeth(a, b, above && x >= bytesPerPixel ? above[x - bytesPerPixel] : 0);
      }
      row[x] = (line[x] + predicted) & 0xff;
    }
  }
  return out;
}

/**
 * The grey value of every pixel, or `undefined` for a file that is not a PNG, not a format read here, or not grey: a
 * palette whose colours are not all grey is a picture already, and is left alone.
 */
export function decodeGrey(bytes: Buffer): GreyImage | undefined {
  if (bytes.length < SIGNATURE.length || !bytes.subarray(0, SIGNATURE.length).equals(SIGNATURE)) return undefined;

  let header: { width: number; height: number; depth: number; colour: number; interlaced: boolean } | undefined;
  let palette: Buffer | undefined;
  const compressed: Buffer[] = [];
  for (let at = SIGNATURE.length; at + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (data.length !== length) return undefined;
    if (type === 'IHDR') {
      if (length < 13) return undefined;
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colour: data[9],
        interlaced: data[12] !== 0
      };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!header || header.interlaced) return undefined;

  const { width, height, depth, colour } = header;
  const channels = CHANNELS[colour];
  const readable = channels !== undefined && (colour === PALETTE ? depth === 8 && palette : depth === 8 || depth === 16);
  if (!readable || width === 0 || height === 0) return undefined;

  const bytesPerPixel = (channels * depth) / 8;
  const stride = width * bytesPerPixel;
  if ((stride + 1) * height > MAX_RAW_BYTES) return undefined;
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * height });
  } catch {
    return undefined;
  }
  if (inflated.length !== (stride + 1) * height) return undefined;
  const raw = unfilter(inflated, stride, height, bytesPerPixel);
  if (!raw) return undefined;

  const sample = depth === 16 ? (at: number) => raw.readUInt16BE(at * 2) : (at: number) => raw[at];
  const values = new Uint8Array(width * height);
  for (let pixel = 0; pixel < values.length; pixel += 1) {
    let r: number, g: number, b: number;
    if (colour === PALETTE) {
      const entry = raw[pixel] * 3;
      if (entry + 2 >= palette!.length) return undefined;
      [r, g, b] = [palette![entry], palette![entry + 1], palette![entry + 2]];
    } else if (colour === RGB || colour === 6) {
      const at = pixel * channels;
      [r, g, b] = [sample(at), sample(at + 1), sample(at + 2)];
    } else {
      r = g = b = sample(pixel * channels);
    }
    // Alpha, where there is one, is not part of the value.
    if (r !== g || g !== b) return undefined;
    values[pixel] = depth === 16 ? Math.round(r / 257) : r;
  }
  return { width, height, values };
}

const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, check]);
};

/**
 * An 8-bit RGB PNG of `width × height` pixels, `rgb` three bytes each. Every row is stored with the "up" filter (the
 * difference from the row above), which is what lets deflate shrink the flat regions of a painted mask.
 */
export function encodeRgb(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (stride + 1)] = 2;
    for (let x = 0; x < stride; x += 1) {
      const above = y > 0 ? rgb[(y - 1) * stride + x] : 0;
      rows[y * (stride + 1) + 1 + x] = (rgb[y * stride + x] - above) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = RGB;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
