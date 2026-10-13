import { semanticPng } from '../../formats/semanticPng';
import { encodeGrayscalePng, decodePng } from '../../utils/png';
import { flatPng, frame, HEIGHT, job, mask, sizeOf, source, toFiles, WIDTH } from './fixtures';

describe('semantic PNG export', () => {
  it('writes the mask as class indices, and classes.json with each index and colour', () => {
    const exporter = semanticPng.createExporter(job);

    const [file] = exporter.frame(frame('0001'));
    const [classes] = exporter.finish();

    expect(file.name).toBe('masks/0001.png');
    expect(Array.from(decodePng(file.data as Buffer).data)).toEqual(Array.from(mask().data));
    expect(classes.name).toBe('classes.json');
    expect(JSON.parse(classes.data as string)).toMatchObject({
      unlabeled: 0,
      classes: [
        { index: 1, name: 'Car', color: '#ff0000' },
        { index: 2, name: 'Road', color: '#00ff00' },
        { index: 3, name: 'Traffic sign', color: '#0000ff' },
      ],
    });
  });

  it('gives a finished frame with nothing painted an all-unlabeled mask, so every image has one', () => {
    const [file] = semanticPng.createExporter(job).frame(frame('0002', { mask: undefined }));
    const decoded = decodePng(file.data as Buffer);
    expect(decoded.width).toBe(WIDTH);
    expect(decoded.data.every((value) => value === 0)).toBe(true);
  });

  it('writes nothing for a frame it cannot size', () => {
    expect(semanticPng.createExporter(job).frame(frame('0003', { mask: undefined, width: undefined }))).toEqual([]);
  });
});

describe('semantic PNG import', () => {
  it('reads back what it wrote', async () => {
    const exporter = semanticPng.createExporter(job);
    const files = toFiles([...exporter.frame(frame('0001')), ...exporter.finish()]);

    const labels = await semanticPng.parse(source(files), { sizeOf });

    expect(labels.classes).toEqual(['Car', 'Road', 'Traffic sign']);
    expect(labels.frames).toHaveLength(1);
    expect(Array.from(labels.frames[0].mask!.data)).toEqual(Array.from(mask().data));
    expect(labels.warnings).toEqual([]);
  });

  it('reads a Cityscapes-style set where class 0 is real and 255 means ignore', async () => {
    const data = new Uint8Array(WIDTH * HEIGHT);
    data[0] = 0; // road, a real class here
    data[1] = 1;
    data[2] = 255;
    const labels = await semanticPng.parse(
      source({
        'classes.json': JSON.stringify([
          { id: 0, name: 'road' },
          { id: 1, name: 'building' },
        ]),
        'gtFine/0001_gtFine_labelIds.png': encodeGrayscalePng(WIDTH, HEIGHT, data),
      }),
      { sizeOf }
    );

    expect(labels.classes).toEqual(['road', 'building']);
    // Stem loses the `_gtFine_labelIds` suffix; road is position 1, building 2, ignore 0.
    expect(labels.frames[0].stem).toBe('0001');
    expect(Array.from(labels.frames[0].mask!.data.slice(0, 3))).toEqual([1, 2, 0]);
  });

  it('refuses a mask of another size than the frame, and frames the job does not have', async () => {
    const labels = await semanticPng.parse(
      source({
        'classes.json': JSON.stringify({ classes: [{ index: 1, name: 'a', color: [1, 2, 3] }] }),
        'masks/wrong.png': encodeGrayscalePng(2, 2, new Uint8Array(4)),
        'masks/unknown.png': encodeGrayscalePng(WIDTH, HEIGHT, new Uint8Array(WIDTH * HEIGHT)),
      }),
      { sizeOf }
    );

    expect(labels.frames).toEqual([]);
    expect(labels.warnings).toEqual(['masks/wrong.png: mask size differs from the frame']);
  });

  it('warns about a mask in a colour type it does not read', async () => {
    const labels = await semanticPng.parse(
      source({
        'classes.json': JSON.stringify([{ index: 1, name: 'a' }]),
        'masks/a.png': flatPng(WIDTH, HEIGHT, 4, [1, 255]),
      }),
      { sizeOf }
    );
    expect(labels.frames).toEqual([]);
    expect(labels.warnings).toEqual(['masks/a.png: unsupported mask colour type 4']);
  });

  it('says when the classes are not named, and skips classes without an index or a name', async () => {
    const labels = await semanticPng.parse(
      source({ 'masks/a.png': encodeGrayscalePng(WIDTH, HEIGHT, new Uint8Array(WIDTH * HEIGHT)) }),
      { sizeOf }
    );
    expect(labels.warnings).toEqual(['no classes.json found; mask values could not be named']);

    const odd = await semanticPng.parse(
      source({
        'classes.json': JSON.stringify([{ name: 'no index' }, { index: 4 }, { index: 5, name: 'ok' }]),
      }),
      { sizeOf }
    );
    expect(odd.classes).toEqual(['ok']);
  });

  it('reads an RGB mask through the class colours', async () => {
    const { deflateSync } = await import('node:zlib');
    const { crc32 } = await import('../../utils/crc32');
    const chunk = (type: string, body: Buffer) => {
      const out = Buffer.alloc(12 + body.length);
      out.writeUInt32BE(body.length, 0);
      out.write(type, 4, 'ascii');
      body.copy(out, 8);
      out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
      return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(WIDTH, 0);
    header.writeUInt32BE(HEIGHT, 4);
    header[8] = 8;
    header[9] = 2;
    const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
    raw[1] = 200; // first pixel: (200, 0, 0)
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);

    const labels = await semanticPng.parse(
      source({
        'classes.json': JSON.stringify([{ index: 1, name: 'red thing', color: '#c80000' }]),
        'masks/a.png': png,
      }),
      { sizeOf }
    );

    expect(labels.frames[0].mask!.data[0]).toBe(1);
    expect(labels.frames[0].mask!.data[1]).toBe(0);
  });
});

describe('semantic PNG detection', () => {
  it('needs both the class list and a PNG', async () => {
    expect(await semanticPng.detect(source({ 'classes.json': '', 'masks/a.png': '' }))).toBe(70);
    expect(await semanticPng.detect(source({ 'classes.json': '' }))).toBe(0);
    expect(await semanticPng.detect(source({ 'masks/a.png': '' }))).toBe(0);
  });
});
