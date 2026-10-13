import { coco } from '../../formats/coco';
import { frame, HEIGHT, job, mask, sizeOf, source, toFiles, WIDTH } from './fixtures';

/** pycocotools' `rleToString`, so a compressed counts string can be made to test the reader. */
const countsToString = (counts: number[]): string => {
  let text = '';
  counts.forEach((count, i) => {
    let x = count;
    if (i > 2) x -= counts[i - 3 + 1];
    let more = true;
    while (more) {
      let c = x & 0x1f;
      x >>= 5;
      more = c & 0x10 ? x !== -1 : x !== 0;
      if (more) c |= 0x20;
      text += String.fromCharCode(c + 48);
    }
  });
  return text;
};

const exported = () => {
  const exporter = coco.createExporter(job);
  exporter.frame(frame('0001'));
  exporter.frame(frame('0002', { objects: [], mask: undefined }));
  const [file] = exporter.finish();
  return JSON.parse(file.data as string) as {
    images: { id: number; file_name: string; width: number; height: number }[];
    categories: { id: number; name: string }[];
    annotations: Record<string, unknown>[];
  };
};

describe('COCO export', () => {
  it('lists every frame, the classes with their mask values, and boxes as x y w h', () => {
    const document = exported();

    expect(document.images).toEqual([
      { id: 1, file_name: '0001.jpg', width: WIDTH, height: HEIGHT },
      { id: 2, file_name: '0002.jpg', width: WIDTH, height: HEIGHT },
    ]);
    expect(document.categories.map((category) => [category.id, category.name])).toEqual([
      [1, 'Car'],
      [2, 'Road'],
      [3, 'Traffic sign'],
    ]);
    expect(document.annotations.filter((entry) => entry.iscrowd === 0)).toEqual([
      { id: 1, image_id: 1, category_id: 1, bbox: [0, 0, 4, 2], area: 8, iscrowd: 0 },
      { id: 2, image_id: 1, category_id: 3, bbox: [5, 1, 2, 2], area: 4, iscrowd: 0, score: 0.75 },
    ]);
  });

  it('writes each painted class as one RLE region, column by column', () => {
    const regions = exported().annotations.filter((entry) => entry.iscrowd === 1);

    expect(regions.map((entry) => entry.category_id)).toEqual([1, 2]);
    expect(regions[0]).toMatchObject({ image_id: 1, bbox: [0, 0, 3, 2], area: 6 });
    // Car: column 0..2 each have rows 0-1 set, 4 background rows after: 0,2,4,2,4,2,4 then the rest.
    expect((regions[0].segmentation as { counts: number[] }).counts).toEqual([0, 2, 4, 2, 4, 2, 4 + 5 * 6]);
    expect((regions[0].segmentation as { size: number[] }).size).toEqual([HEIGHT, WIDTH]);
  });

  it('keeps the dimensions of a frame whose size is unknown from the mask, or zero', () => {
    const exporter = coco.createExporter(job);
    exporter.frame(frame('a', { width: undefined, height: undefined }));
    exporter.frame(frame('b', { width: undefined, height: undefined, mask: undefined }));
    const document = JSON.parse(exporter.finish()[0].data as string);

    expect(document.images[0]).toMatchObject({ width: WIDTH, height: HEIGHT });
    expect(document.images[1]).toMatchObject({ width: 0, height: 0 });
  });

  it('drops boxes of classes the job does not have, and degenerate ones', () => {
    const exporter = coco.createExporter(job);
    exporter.frame(
      frame('a', {
        mask: undefined,
        objects: [
          { id: 'g', classKey: 'ghost', bbox: [0, 0, 2, 2], source: 'human' },
          { id: 'z', classKey: 'car', bbox: [0, 0, 0, 2], source: 'human' },
        ],
      })
    );
    expect(JSON.parse(exporter.finish()[0].data as string).annotations).toEqual([]);
  });

  it('skips a class that has no pixels, even when its index appears in the mask legend', () => {
    const exporter = coco.createExporter(job);
    const onlyRoad = mask();
    onlyRoad.data.forEach((value, i) => {
      if (value === 1) onlyRoad.data[i] = 0;
    });
    exporter.frame(frame('a', { objects: [], mask: onlyRoad }));
    const annotations = JSON.parse(exporter.finish()[0].data as string).annotations;
    expect(annotations.map((entry: { category_id: number }) => entry.category_id)).toEqual([2]);
  });
});

describe('COCO import', () => {
  it('reads back what it wrote, boxes and mask included', async () => {
    const exporter = coco.createExporter(job);
    exporter.frame(frame('0001'));
    const files = toFiles(exporter.finish());

    const labels = await coco.parse(source(files), { sizeOf });

    expect(labels.classes).toEqual(['Car', 'Road', 'Traffic sign']);
    expect(labels.frames).toHaveLength(1);
    expect(labels.frames[0].boxes).toEqual([
      { className: 'Car', bbox: [0, 0, 4, 2] },
      { className: 'Traffic sign', bbox: [5, 1, 2, 2], score: 0.75 },
    ]);
    expect(Array.from(labels.frames[0].mask!.data)).toEqual(Array.from(mask().data));
  });

  it('does not turn a crowd region’s own bounding box into a box object', async () => {
    const exporter = coco.createExporter(job);
    exporter.frame(frame('0001', { objects: [] }));

    const labels = await coco.parse(source(toFiles(exporter.finish())), { sizeOf });

    expect(labels.frames[0].boxes).toEqual([]);
    expect(labels.frames[0].mask).toBeDefined();
  });

  it('reads polygon segmentations, taking the box from them when none is given', async () => {
    const file = {
      images: [{ id: 7, file_name: 'a/0007.jpg', width: WIDTH, height: HEIGHT }],
      categories: [{ id: 5, name: 'person' }],
      annotations: [{ image_id: 7, category_id: 5, segmentation: [[1, 1, 5, 1, 5, 4, 1, 4]] }],
    };

    const labels = await coco.parse(source({ 'instances.json': JSON.stringify(file) }), { sizeOf });

    expect(labels.classes).toEqual(['person']);
    const [only] = labels.frames;
    expect(only.stem).toBe('0007');
    expect(only.boxes).toEqual([{ className: 'person', bbox: [1, 1, 4, 3] }]);
    // The rectangle 1..5 × 1..4 is filled, and nothing outside it.
    expect(only.mask!.data[1 * WIDTH + 1]).toBe(1);
    expect(only.mask!.data[3 * WIDTH + 4]).toBe(1);
    expect(only.mask!.data[0]).toBe(0);
    expect(only.mask!.data[4 * WIDTH + 1]).toBe(0);
  });

  it('reads a compressed counts string and uncompressed counts alike', async () => {
    const counts = [3, 2, 6, 2, 35];
    const region = (segmentation: unknown) => ({
      images: [{ id: 1, file_name: 'a.jpg' }],
      categories: [{ id: 1, name: 'thing' }],
      annotations: [{ image_id: 1, category_id: 1, iscrowd: 1, segmentation }],
    });
    const asString = countsToString(counts);
    const fromString = await coco.parse(
      source({ 'a.json': JSON.stringify(region({ size: [HEIGHT, WIDTH], counts: asString })) }),
      { sizeOf }
    );
    const fromList = await coco.parse(
      source({ 'a.json': JSON.stringify(region({ size: [HEIGHT, WIDTH], counts })) }),
      { sizeOf }
    );

    expect(Array.from(fromString.frames[0].mask!.data)).toEqual(Array.from(fromList.frames[0].mask!.data));
    expect(fromList.frames[0].mask!.data.filter((value) => value === 1)).toHaveLength(4);
  });

  it('sizes a frame from the file when the job does not know it, and warns about a size mismatch', async () => {
    const file = {
      images: [
        { id: 1, file_name: 'unknown.jpg', width: 4, height: 2 },
        { id: 2, file_name: 'a.jpg', width: WIDTH, height: HEIGHT },
      ],
      categories: [{ id: 1, name: 'thing' }],
      annotations: [
        { image_id: 1, category_id: 1, bbox: [0, 0, 1, 1], segmentation: { size: [2, 4], counts: [0, 8] } },
        { image_id: 2, category_id: 1, segmentation: { size: [2, 2], counts: [0, 4] } },
      ],
    };

    const labels = await coco.parse(source({ 'a.json': JSON.stringify(file) }), { sizeOf });

    expect(labels.frames[0].mask).toMatchObject({ width: 4, height: 2 });
    expect(labels.warnings).toEqual(['a.jpg: mask size differs from the frame']);
  });

  it('skips annotations of unknown categories, images without names, and invalid boxes', async () => {
    const file = {
      images: [{ id: 1, file_name: 'a.jpg' }, { id: 2 }],
      categories: [{ id: 1 }],
      annotations: [
        { image_id: 1, category_id: 99, bbox: [0, 0, 1, 1] },
        { image_id: 1, category_id: 1, bbox: [0, 0, 0, 1] },
        { image_id: 1, category_id: 1, bbox: [0, 0, 2] },
        { image_id: 2, category_id: 1, bbox: [0, 0, 1, 1] },
      ],
    };

    const labels = await coco.parse(source({ 'a.json': JSON.stringify(file) }), { sizeOf });

    expect(labels.classes).toEqual(['1']);
    expect(labels.frames).toEqual([{ stem: 'a', boxes: [] }]);
  });

  it('says so when there is no COCO file in the archive', async () => {
    const labels = await coco.parse(source({ 'a.json': '{"hello": 1}', 'b.txt': '' }), { sizeOf });
    expect(labels.frames).toEqual([]);
    expect(labels.warnings).toEqual(['no COCO annotations file found']);
  });
});

describe('COCO detection', () => {
  it('recognises a file with images, annotations and categories', async () => {
    const valid = JSON.stringify({ images: [], annotations: [], categories: [] });
    expect(await coco.detect(source({ 'annotations.json': valid }))).toBe(90);
    expect(await coco.detect(source({ 'other.json': '{"images": []}', 'broken.json': 'nope' }))).toBe(0);
    expect(await coco.detect(source({ 'a.txt': '' }))).toBe(0);
  });
});
