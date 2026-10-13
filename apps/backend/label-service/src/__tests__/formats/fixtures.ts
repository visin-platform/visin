import { deflateSync } from 'node:zlib';
import { crc32 } from '../../utils/crc32';
import type { ExportJob, ExportFile, FrameLabels, ImportSource } from '../../formats/types';
import type { RawMask } from '../../utils/mask';

export const WIDTH = 8;
export const HEIGHT = 6;

export const job: ExportJob = {
  name: 'Street',
  classes: [
    { key: 'car', name: 'Car', color: '#ff0000', tools: ['box', 'mask'], maskIndex: 1 },
    { key: 'road', name: 'Road', color: '#00ff00', tools: ['mask'], maskIndex: 2 },
    { key: 'sign', name: 'Traffic sign', color: '#0000ff', tools: ['box'], maskIndex: 3 },
  ],
};

/** Car in the top-left 3×2, road along the bottom two rows, everything else unlabeled. */
export const mask = (): RawMask => {
  const data = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) data[y * WIDTH + x] = 1;
  for (let y = 4; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) data[y * WIDTH + x] = 2;
  return { width: WIDTH, height: HEIGHT, data };
};

export const frame = (stem: string, overrides: Partial<FrameLabels> = {}): FrameLabels => ({
  stem,
  path: `camera/${stem}.jpg`,
  width: WIDTH,
  height: HEIGHT,
  objects: [
    { id: 'o1', classKey: 'car', bbox: [0, 0, 4, 2], source: 'human' },
    { id: 'o2', classKey: 'sign', bbox: [5, 1, 2, 2], source: 'model', score: 0.75 },
  ],
  mask: mask(),
  ...overrides,
});

/** An archive as the import side sees it: names, and a way to read them. */
export const source = (files: Record<string, Buffer | string>): ImportSource => ({
  names: Object.keys(files),
  read: async (name) => {
    const found = files[name];
    if (found === undefined) throw new Error(`no ${name}`);
    return Buffer.isBuffer(found) ? found : Buffer.from(found);
  },
});

export const toFiles = (written: ExportFile[]): Record<string, Buffer | string> =>
  Object.fromEntries(written.map((file) => [file.name, file.data]));

/** The frames of the fixed fixture size, as `sizeOf` for every stem. */
export const sizeOf = (stem?: string) => (stem === 'unknown' ? undefined : { width: WIDTH, height: HEIGHT });

/**
 * An 8-bit PNG of one repeated pixel, in any colour type: other tools write
 * these (RGB masks from CVAT, gray+alpha from image editors) and the editor never does.
 */
export const flatPng = (width: number, height: number, colorType: 2 | 4 | 6, pixel: number[]): Buffer => {
  const chunk = (type: string, body: Buffer): Buffer => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'ascii');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: width }, () => Buffer.from(pixel))]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
