import { toStem, parseManifest } from '../../utils/manifest';
import { BadRequestError } from '@visin/backend-core';

describe('toStem', () => {
  it('strips directories and extensions', () => {
    expect(toStem('frames/frame_000012.png')).toBe('frame_000012');
    expect(toStem('frame_000012.jpg')).toBe('frame_000012');
  });

  it('strips the compound .ids.png and .masks.json suffixes', () => {
    expect(toStem('ann/llava/frame_000012.ids.png')).toBe('frame_000012');
    expect(toStem('frame_000012.masks.json')).toBe('frame_000012');
  });

  it('keeps interior dots', () => {
    expect(toStem('frames/clip.01.frame.png')).toBe('clip.01.frame');
  });
});

describe('parseManifest csv', () => {
  it('parses filename + stratum columns and reduces filenames to stems', () => {
    const rows = parseManifest('filename,stratum\nframes/a.png,vehicle\nb.jpg,sign\n', 'csv');

    expect(rows).toEqual([
      { stem: 'a', stratum: 'vehicle' },
      { stem: 'b', stratum: 'sign' },
    ]);
  });

  it('works without a stratum column', () => {
    expect(parseManifest('filename\na.png', 'csv')).toEqual([{ stem: 'a' }]);
  });

  it('rejects a missing filename header and empty content', () => {
    expect(() => parseManifest('name\na.png', 'csv')).toThrow(BadRequestError);
    expect(() => parseManifest('  \n \n', 'csv')).toThrow(BadRequestError);
  });

  it('rejects a row with an empty filename cell', () => {
    expect(() => parseManifest('filename,stratum\n,x', 'csv')).toThrow(BadRequestError);
  });
});

describe('parseManifest jsonl', () => {
  it('parses one object per line', () => {
    const rows = parseManifest('{"filename":"frames/a.png","stratum":"s1"}\n{"filename":"b.png"}', 'jsonl');

    expect(rows).toEqual([{ stem: 'a', stratum: 's1' }, { stem: 'b' }]);
  });

  it('rejects invalid JSON and missing filename', () => {
    expect(() => parseManifest('not-json', 'jsonl')).toThrow(BadRequestError);
    expect(() => parseManifest('{"stratum":"x"}', 'jsonl')).toThrow(BadRequestError);
  });
});
