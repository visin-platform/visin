import { visin } from '../../formats/visin';
import { decodePng } from '../../utils/png';
import { frame, job, mask, sizeOf, source, toFiles, WIDTH } from './fixtures';

describe('Visin bundle export', () => {
  it('writes one JSON line per frame, the mask PNG, and job.json with the classes', () => {
    const exporter = visin.createExporter(job);

    const withMask = exporter.frame(frame('0001'));
    const withoutMask = exporter.frame(frame('0002', { mask: undefined, objects: [] }));
    const written = exporter.finish();

    expect(withMask.map((file) => file.name)).toEqual(['masks/0001.png']);
    expect(withoutMask).toEqual([]);
    expect(Array.from(decodePng(withMask[0].data as Buffer).data)).toEqual(Array.from(mask().data));

    const lines = (written[0].data as string).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines[0]).toMatchObject({
      stem: '0001',
      frame: 'camera/0001.jpg',
      width: WIDTH,
      mask: 'masks/0001.png',
      objects: [
        { id: 'o1', class: 'car', bbox: [0, 0, 4, 2], source: 'human' },
        { id: 'o2', class: 'sign', bbox: [5, 1, 2, 2], source: 'model', score: 0.75 },
      ],
    });
    expect(lines[1]).toMatchObject({ stem: '0002', mask: null, objects: [] });

    const document = JSON.parse(written[1].data as string);
    expect(document).toMatchObject({ format: 'visin', version: 1, name: 'Street' });
    expect(document.classes.map((entry: { key: string; maskIndex: number }) => [entry.key, entry.maskIndex])).toEqual([
      ['car', 1],
      ['road', 2],
      ['sign', 3],
    ]);
  });

  it('writes an empty annotations file for a job with no finished frames, and keeps optional class fields', () => {
    const exporter = visin.createExporter({
      ...job,
      classes: [{ key: 'a', name: 'A', color: '#000000', tools: ['box'], maskIndex: 1, hotkey: 'a', modelClass: 'thing' }],
    });
    const [lines, document] = exporter.finish();

    expect(lines.data).toBe('');
    expect(JSON.parse(document.data as string).classes[0]).toMatchObject({ hotkey: 'a', modelClass: 'thing' });
  });

  it('leaves out boxes of classes the job does not have', () => {
    const exporter = visin.createExporter(job);
    exporter.frame(frame('a', { mask: undefined, objects: [{ id: 'g', classKey: 'ghost', bbox: [0, 0, 1, 1], source: 'human' }] }));
    expect(JSON.parse((exporter.finish()[0].data as string).trim()).objects).toEqual([]);
  });
});

describe('Visin bundle import', () => {
  it('reads back boxes with their class names and the mask, mapping each mask value to its class', async () => {
    const exporter = visin.createExporter(job);
    const files = toFiles([...exporter.frame(frame('0001')), ...exporter.finish()]);

    const labels = await visin.parse(source(files), { sizeOf });

    expect(labels.classes).toEqual(['Car', 'Road', 'Traffic sign']);
    expect(labels.frames).toHaveLength(1);
    expect(labels.frames[0].boxes).toEqual([
      { className: 'Car', bbox: [0, 0, 4, 2] },
      { className: 'Traffic sign', bbox: [5, 1, 2, 2], score: 0.75 },
    ]);
    expect(Array.from(labels.frames[0].mask!.data)).toEqual(Array.from(mask().data));
  });

  it('keeps mask values aligned when a class number was never used', async () => {
    const files = {
      'job.json': JSON.stringify({ classes: [{ key: 'b', name: 'B', maskIndex: 3 }] }),
      'annotations.jsonl': '',
    };
    const labels = await visin.parse(source(files), { sizeOf });
    expect(labels.classes).toEqual(['', '', 'B']);
  });

  it('skips lines that are not JSON, frames the job does not have, and boxes that are not boxes', async () => {
    const files = {
      'job.json': JSON.stringify({ classes: [{ key: 'car', name: 'Car', maskIndex: 1 }] }),
      'annotations.jsonl': [
        'not json',
        '',
        JSON.stringify({ stem: 'unknown', objects: [] }),
        JSON.stringify({ frame: 'camera/a.jpg', objects: [{ class: 'car', bbox: [1, 1] }, { class: 'wheel', bbox: [0, 0, 2, 2] }] }),
        JSON.stringify({ objects: [] }),
        JSON.stringify({ stem: 'b', objects: [], mask: 'masks/missing.png' }),
      ].join('\n'),
    };

    const labels = await visin.parse(source(files), { sizeOf });

    expect(labels.warnings).toEqual(['a line of annotations.jsonl is not valid JSON']);
    expect(labels.frames).toEqual([
      // A class key the job.json does not describe is kept as it is.
      { stem: 'a', boxes: [{ className: 'wheel', bbox: [0, 0, 2, 2] }] },
      { stem: 'b', boxes: [] },
    ]);
  });

  it('copes with a bundle that lacks its job.json or annotations file', async () => {
    const labels = await visin.parse(source({ 'masks/a.png': '' }), { sizeOf });
    expect(labels).toEqual({ classes: [], frames: [], warnings: [], unsized: [] });
  });
});

describe('Visin bundle detection', () => {
  it('needs job.json and annotations.jsonl together', async () => {
    expect(await visin.detect(source({ 'job.json': '', 'annotations.jsonl': '' }))).toBe(100);
    expect(await visin.detect(source({ 'job.json': '' }))).toBe(0);
    expect(await visin.detect(source({ 'annotations.jsonl': '' }))).toBe(0);
  });
});
