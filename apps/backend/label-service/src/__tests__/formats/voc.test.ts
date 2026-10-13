import { voc } from '../../formats/voc';
import { decodePng, encodeGrayscalePng, encodePalettePng } from '../../utils/png';
import { flatPng, frame, HEIGHT, job, mask, sizeOf, source, toFiles, WIDTH } from './fixtures';

describe('Pascal VOC export', () => {
  it('writes one XML per image with 1-based inclusive boxes, and a palette mask', () => {
    const exporter = voc.createExporter(job);

    const files = exporter.frame(frame('0001'));

    expect(files.map((file) => file.name)).toEqual(['Annotations/0001.xml', 'SegmentationClass/0001.png']);
    const xml = files[0].data as string;
    expect(xml).toContain('<filename>0001.jpg</filename>');
    expect(xml).toContain(`<width>${WIDTH}</width>`);
    expect(xml).toContain('<segmented>1</segmented>');
    // Car [0,0,4,2] → xmin 1, ymin 1, xmax 4, ymax 2; the sign is [5,1,2,2] → 6,2,7,3.
    expect(xml).toMatch(/<name>Car<\/name>[\s\S]*<xmin>1<\/xmin>\s*<ymin>1<\/ymin>\s*<xmax>4<\/xmax>\s*<ymax>2<\/ymax>/);
    expect(xml).toMatch(/<name>Traffic sign<\/name>[\s\S]*<xmin>6<\/xmin>\s*<ymin>2<\/ymin>\s*<xmax>7<\/xmax>\s*<ymax>3<\/ymax>/);

    const png = decodePng(files[1].data as Buffer);
    expect(png.colorType).toBe(3);
    expect(png.palette![1]).toEqual([255, 0, 0]);
    expect(Array.from(png.data)).toEqual(Array.from(mask().data));
  });

  it('marks a frame without a mask as not segmented and escapes names', () => {
    const exporter = voc.createExporter({
      ...job,
      classes: [{ key: 'a', name: 'Fish & <Chips>', color: '#112233', tools: ['box'], maskIndex: 1 }],
    });

    const files = exporter.frame(
      frame('0002', { mask: undefined, objects: [{ id: 'o', classKey: 'a', bbox: [0, 0, 2, 2], source: 'human' }] })
    );

    expect(files).toHaveLength(1);
    expect(files[0].data).toContain('<segmented>0</segmented>');
    expect(files[0].data).toContain('<name>Fish &amp; &lt;Chips&gt;</name>');
  });

  it('writes size 0 for an unknown frame size, skipping classes the job does not have', () => {
    const [file] = voc.createExporter(job).frame(
      frame('0003', {
        width: undefined,
        height: undefined,
        mask: undefined,
        objects: [
          { id: 'g', classKey: 'ghost', bbox: [0, 0, 2, 2], source: 'human' },
          { id: 'z', classKey: 'car', bbox: [0, 0, 0, 2], source: 'human' },
        ],
      })
    );
    expect(file.data).toContain('<width>0</width>');
    expect(file.data).not.toContain('<object>');
  });

  it('writes a labelmap with the classes and their colours', () => {
    const [file] = voc.createExporter(job).finish();

    expect(file.name).toBe('labelmap.txt');
    expect(file.data).toBe(
      '# label:color_rgb:parts:actions\nbackground:0,0,0::\nCar:255,0,0::\nRoad:0,255,0::\nTraffic sign:0,0,255::\n'
    );
  });
});

describe('Pascal VOC import', () => {
  it('reads back what it wrote', async () => {
    const exporter = voc.createExporter(job);
    const files = toFiles([...exporter.frame(frame('0001')), ...exporter.finish()]);

    const labels = await voc.parse(source(files), { sizeOf });

    expect(labels.classes).toEqual(['Car', 'Road', 'Traffic sign']);
    expect(labels.frames).toHaveLength(1);
    expect(labels.frames[0].boxes).toEqual([
      { className: 'Car', bbox: [0, 0, 4, 2] },
      { className: 'Traffic sign', bbox: [5, 1, 2, 2] },
    ]);
    expect(Array.from(labels.frames[0].mask!.data)).toEqual(Array.from(mask().data));
  });

  it('numbers classes alphabetically when there is no labelmap, as the original VOC does', async () => {
    const xml = (name: string) =>
      `<annotation><object><name>${name}</name><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>4</xmax><ymax>3</ymax></bndbox></object></annotation>`;
    const data = new Uint8Array(WIDTH * HEIGHT);
    data[0] = 2; // person
    data[1] = 255; // void border
    const labels = await voc.parse(
      source({
        'Annotations/a.xml': xml('person'),
        'Annotations/b.xml': xml('car') + xml('person'),
        'SegmentationClass/a.png': encodePalettePng(WIDTH, HEIGHT, data, [[0, 0, 0]]),
      }),
      { sizeOf }
    );

    expect(labels.classes).toEqual(['car', 'person']);
    const a = labels.frames.find((frame) => frame.stem === 'a')!;
    expect(a.mask!.data[0]).toBe(2);
    expect(a.mask!.data[1]).toBe(0);
  });

  it('reads colour masks through the labelmap, the way CVAT writes them', async () => {
    const rgb = Buffer.alloc(WIDTH * HEIGHT * 3);
    rgb.writeUInt8(255, 0); // pixel 0: red → Car
    rgb.writeUInt8(255, 4); // pixel 1: green → Road
    // Build an RGB PNG by hand: colour type 2, filter 0.
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
    for (let y = 0; y < HEIGHT; y++) rgb.copy(raw, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);

    const labels = await voc.parse(
      source({
        'labelmap.txt': '# label:color_rgb:parts:actions\nbackground:0,0,0::\nCar:255,0,0::\nRoad:0,255,0::\n',
        'SegmentationClass/a.png': png,
      }),
      { sizeOf }
    );

    expect(labels.classes).toEqual(['Car', 'Road']);
    expect(labels.frames[0].mask!.data[0]).toBe(1);
    expect(labels.frames[0].mask!.data[1]).toBe(2);
    expect(labels.frames[0].mask!.data[2]).toBe(0);
  });

  it('reads a palette mask with a labelmap that does not list background first', async () => {
    const labels = await voc.parse(
      source({
        'labelmap.txt': 'Car:255,0,0::\nRoad:0,255,0::\n',
        'SegmentationClass/a.png': encodePalettePng(WIDTH, HEIGHT, new Uint8Array(WIDTH * HEIGHT).fill(1), [[0, 0, 0]]),
      }),
      { sizeOf }
    );
    // Value 1 is the second labelmap line when line 0 is read as background.
    expect(labels.classes).toEqual(['Car', 'Road']);
    expect(labels.frames[0].mask!.data[0]).toBe(2);
  });

  it('adds a class that only the boxes name, and skips malformed objects', async () => {
    const labels = await voc.parse(
      source({
        'labelmap.txt': 'background:0,0,0::\nCar:255,0,0::\n',
        'Annotations/a.xml':
          '<annotation><object><name>Bike</name><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>3</xmax><ymax>3</ymax></bndbox></object>' +
          '<object><name>Car</name><bndbox><xmin>x</xmin><ymin>1</ymin><xmax>3</xmax><ymax>3</ymax></bndbox></object>' +
          '<object><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>3</xmax><ymax>3</ymax></bndbox></object></annotation>',
      }),
      { sizeOf }
    );

    expect(labels.classes).toEqual(['Car', 'Bike']);
    expect(labels.frames[0].boxes).toEqual([{ className: 'Bike', bbox: [0, 0, 3, 3] }]);
  });

  it('warns about masks it cannot use: wrong size, or a colour type it does not read', async () => {
    const labels = await voc.parse(
      source({
        'labelmap.txt': 'background:0,0,0::\nCar:255,0,0::\n',
        'SegmentationClass/small.png': encodePalettePng(2, 2, new Uint8Array(4), [[0, 0, 0]]),
        'SegmentationClass/alpha.png': flatPng(WIDTH, HEIGHT, 4, [1, 255]),
        'SegmentationClass/gray.png': encodeGrayscalePng(WIDTH, HEIGHT, new Uint8Array(WIDTH * HEIGHT).fill(1)),
      }),
      { sizeOf }
    );

    expect(labels.warnings).toEqual([
      'SegmentationClass/small.png: mask size differs from the frame',
      'SegmentationClass/alpha.png: unsupported mask colour type 4',
    ]);
    // Grayscale is read like a palette index: value 1 is the first class.
    expect(labels.frames.map((frame) => frame.stem)).toEqual(['gray']);
    expect(labels.frames[0].mask!.data[0]).toBe(1);
  });
});

describe('Pascal VOC detection', () => {
  it('is sure of Annotations or SegmentationClass folders and unsure of bare XML', async () => {
    expect(await voc.detect(source({ 'Annotations/a.xml': '' }))).toBe(80);
    expect(await voc.detect(source({ 'SegmentationClass/a.png': '', 'x/a.xml': '' }))).toBe(80);
    expect(await voc.detect(source({ 'a.xml': '' }))).toBe(40);
    expect(await voc.detect(source({ 'a.png': '' }))).toBe(0);
  });
});
