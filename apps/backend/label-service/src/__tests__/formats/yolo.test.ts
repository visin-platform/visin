import { parseYamlNames, yolo } from '../../formats/yolo';
import { frame, job, sizeOf, source, toFiles } from './fixtures';

describe('YOLO export', () => {
  it('writes normalised class cx cy w h per image, in the job class order', () => {
    const exporter = yolo.createExporter(job);

    const files = exporter.frame(frame('0001'));

    expect(files).toEqual([
      // car is class 0 (box [0,0,4,2] in 8×6), sign is class 2 (box [5,1,2,2]).
      { name: 'labels/0001.txt', data: '0 0.25 0.166667 0.5 0.333333\n2 0.75 0.333333 0.25 0.333333\n' },
    ]);
  });

  it('writes an empty file for a frame with nothing on it, so it stays a negative example', () => {
    const [file] = yolo.createExporter(job).frame(frame('0002', { objects: [] }));
    expect(file).toEqual({ name: 'labels/0002.txt', data: '' });
  });

  it('skips a frame whose size is unknown, and boxes of classes the job does not have', () => {
    const exporter = yolo.createExporter(job);
    expect(exporter.frame(frame('0003', { width: undefined }))).toEqual([]);

    const [file] = exporter.frame(
      frame('0004', {
        objects: [
          { id: 'g', classKey: 'ghost', bbox: [0, 0, 2, 2], source: 'human' },
          { id: 'z', classKey: 'car', bbox: [0, 0, 0, 2], source: 'human' },
        ],
      })
    );
    expect(file.data).toBe('');
  });

  it('writes data.yaml with every class name, quoted', () => {
    const [file] = yolo.createExporter(job).finish();

    expect(file.name).toBe('data.yaml');
    expect(parseYamlNames(file.data as string)).toEqual(['Car', 'Road', 'Traffic sign']);
    expect(file.data).toContain('nc: 3');
  });
});

describe('YOLO import', () => {
  it('reads back what it wrote', async () => {
    const exporter = yolo.createExporter(job);
    const files = toFiles([...exporter.frame(frame('0001')), ...exporter.finish()]);

    const labels = await yolo.parse(source(files), { sizeOf });

    expect(labels.classes).toEqual(['Car', 'Road', 'Traffic sign']);
    expect(labels.frames).toEqual([
      {
        stem: '0001',
        boxes: [
          { className: 'Car', bbox: [0, 0, 4, 2] },
          { className: 'Traffic sign', bbox: [5, 1, 2, 2] },
        ],
      },
    ]);
    expect(labels.warnings).toEqual([]);
  });

  it('reads prediction confidences, and the box around a segmentation polygon', async () => {
    const labels = await yolo.parse(
      source({
        'labels/a.txt': '0 0.5 0.5 0.25 0.5 0.9\n1 0.1 0.1 0.5 0.1 0.5 0.5 0.1 0.5\n',
        'classes.txt': 'person\nbike\n',
      }),
      { sizeOf }
    );

    expect(labels.classes).toEqual(['person', 'bike']);
    expect(labels.frames[0].boxes).toEqual([
      { className: 'person', bbox: [3, 1.5, 2, 3], score: 0.9 },
      { className: 'bike', bbox: [0.8, 0.6, 3.2, 2.4] },
    ]);
  });

  it('names classes the file does not, and says so', async () => {
    const labels = await yolo.parse(source({ 'labels/a.txt': '2 0.5 0.5 0.5 0.5\n' }), { sizeOf });

    expect(labels.classes).toEqual(['class_0', 'class_1', 'class_2']);
    expect(labels.frames[0].boxes[0].className).toBe('class_2');
    expect(labels.warnings).toHaveLength(3);
  });

  it('skips malformed lines and frames it cannot size', async () => {
    const labels = await yolo.parse(
      source({
        'labels/a.txt': 'car 0.5 0.5 0.5 0.5\n0 0.5\n0 0.5 0.5 x 0.5\n1.5 0.5 0.5 0.5 0.5\n-1 0.5 0.5 0.5 0.5\n0 0.5 0.5 0.5 0.5 0.5 0.5 0.5\n\n',
        'labels/unknown.txt': '0 0.5 0.5 0.5 0.5\n',
        'data.yaml': 'names: [thing]\n',
      }),
      { sizeOf }
    );

    expect(labels.frames).toEqual([{ stem: 'a', boxes: [] }]);
    expect(labels.unsized).toEqual(['unknown']);
  });

  it('is not fooled by a polygon with no area', async () => {
    const labels = await yolo.parse(source({ 'labels/a.txt': '0 0.1 0.1 0.1 0.1 0.1 0.1\n', 'data.yaml': 'names: [a]\n' }), { sizeOf });
    expect(labels.frames[0].boxes).toEqual([]);
  });
});

describe('YOLO detection', () => {
  it('is sure of a labels folder with data.yaml, and unsure of bare text files', async () => {
    expect(await yolo.detect(source({ 'labels/a.txt': '', 'data.yaml': '' }))).toBe(60);
    expect(await yolo.detect(source({ 'labels/a.txt': '' }))).toBe(60);
    expect(await yolo.detect(source({ 'a.txt': '' }))).toBe(20);
    expect(await yolo.detect(source({ 'a.txt': '', 'classes.txt': '' }))).toBe(60);
  });

  it('does not take class lists and image lists for labels', async () => {
    expect(await yolo.detect(source({ 'classes.txt': '', 'train.txt': '', 'obj.names': '' }))).toBe(0);
    expect(await yolo.detect(source({ 'image.png': '' }))).toBe(0);
  });
});

describe('parseYamlNames', () => {
  it('reads an indented map, a list, a flow list and a flow map', () => {
    expect(parseYamlNames('path: .\nnames:\n  0: car\n  2: "bus"\nnc: 3\n')).toEqual(['car', undefined, 'bus']);
    expect(parseYamlNames('names:\n  - a\n  - \'b\'\n')).toEqual(['a', 'b']);
    expect(parseYamlNames("names: ['a', \"b\"]\n")).toEqual(['a', 'b']);
    expect(parseYamlNames('names: {0: a, 1: b}\n')).toEqual(['a', 'b']);
  });

  it('is empty when there are no names', () => {
    expect(parseYamlNames('path: .\n')).toEqual([]);
    expect(parseYamlNames('names:\nnc: 0\n')).toEqual([]);
  });
});
