import { parseManifest, splitCsvLine } from '../../utils/manifest';

it('splits quoted CSV cells', () => {
  expect(splitCsvLine('a, "b, c" ,"d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
});

it('parses CSV rows into stems and attributes', () => {
  expect(parseManifest('filename,stratum,score\nframes/0001.jpg,day,0.5\n0002.ids.png,night,\n', 'csv')).toEqual([
    { stem: '0001', attributes: { stratum: 'day', score: '0.5' } },
    { stem: '0002', attributes: { stratum: 'night', score: '' } }
  ]);
});

it('parses JSONL rows, keeping scalar fields only', () => {
  expect(parseManifest('{"file":"a/0001.png","stratum":"x","n":2,"nested":{"a":1}}\n', 'jsonl')).toEqual([
    { stem: '0001', attributes: { stratum: 'x', n: '2' } }
  ]);
});

it.each([
  ['', 'csv', 'empty'],
  ['stratum\nday', 'csv', 'header column'],
  ['filename,stratum\n,day', 'csv', 'row 2'],
  ['not json', 'jsonl', 'not valid JSON'],
  ['[1]', 'jsonl', 'not an object'],
  ['{"stratum":"x"}', 'jsonl', 'names no file']
] as const)('rejects %j', (content, format, message) => {
  expect(() => parseManifest(content, format)).toThrow(message);
});
