import { describeFormats, detectFormat, FORMATS, getFormat } from '../../formats';
import { source } from './fixtures';
import { yolo } from '../../formats/yolo';

describe('format registry', () => {
  it('has the five formats, each reachable by its id', () => {
    expect(FORMATS.map((format) => format.id)).toEqual(['yolo', 'coco', 'voc', 'semantic-png', 'visin']);
    expect(getFormat('yolo')).toBe(yolo);
  });

  it('refuses an id it does not know', () => {
    expect(() => getFormat('csv' as never)).toThrow('Unknown format "csv"');
  });

  it('describes what each format can hold, without exposing the modules', () => {
    const described = describeFormats();

    expect(described.find((format) => format.id === 'yolo')).toEqual({
      id: 'yolo',
      name: 'YOLO',
      description: expect.any(String),
      boxes: true,
      masks: false,
    });
    expect(described.find((format) => format.id === 'semantic-png')).toMatchObject({ boxes: false, masks: true });
    expect(described.every((format) => !('detect' in format))).toBe(true);
  });

  it('picks the format an archive most looks like', async () => {
    expect((await detectFormat(source({ 'job.json': '', 'annotations.jsonl': '', 'masks/a.png': '', 'labels/a.txt': '' })))!.id).toBe('visin');
    expect((await detectFormat(source({ 'labels/a.txt': '', 'data.yaml': '' })))!.id).toBe('yolo');
    expect((await detectFormat(source({ 'Annotations/a.xml': '' })))!.id).toBe('voc');
    expect(await detectFormat(source({ 'readme.md': '' }))).toBeUndefined();
  });
});
