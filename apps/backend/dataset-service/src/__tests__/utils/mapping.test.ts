import { createClassifier } from '../../utils/mapping';

describe('createClassifier', () => {
  const classify = createClassifier({
    groups: [
      { folder: 'frames', group: 'frames' },
      { folder: 'annotations/', group: 'labels' },
      { folder: 'annotations/verify', group: 'verify' }
    ],
    manifest: 'meta/manifest.csv'
  });

  it('sends each file to the deepest mapped folder', () => {
    expect(classify('frames/0001.jpg')).toEqual({ type: 'image', path: 'frames/0001.jpg', group: 'frames', stem: '0001' });
    expect(classify('annotations/verify/0001.ids.png')).toEqual({
      type: 'image', path: 'annotations/verify/0001.ids.png', group: 'verify', stem: '0001', variant: 'ids'
    });
    expect(classify('annotations/other/deep/0001.png')).toMatchObject({ type: 'image', group: 'labels' });
    expect(classify('annotations/verify/0001.masks.json')).toMatchObject({ type: 'json', group: 'verify', variant: 'masks' });
  });

  it('skips what is unmapped or not stored, and flags unsafe paths', () => {
    expect(classify('lidar/0001.bin')).toEqual({ type: 'skipped', path: 'lidar/0001.bin' });
    expect(classify('frames/0001.bin')).toEqual({ type: 'skipped', path: 'frames/0001.bin' });
    expect(classify('frames/')).toEqual({ type: 'skipped', path: 'frames/' });
    expect(classify('../frames/0001.png')).toMatchObject({ type: 'invalid' });
  });

  it('recognises the mapped manifest by exact path', () => {
    expect(classify('meta/manifest.csv')).toEqual({ type: 'manifest', path: 'meta/manifest.csv', format: 'csv' });
    expect(createClassifier({ groups: [], manifest: 'rows.jsonl' })('rows.jsonl')).toMatchObject({ format: 'jsonl' });
    expect(createClassifier({ groups: [], manifest: 'rows.txt' })('rows.txt')).toMatchObject({ type: 'invalid' });
  });

  it('maps the zip root with an empty folder', () => {
    expect(createClassifier({ groups: [{ folder: '', group: 'all' }] })('x/y.png')).toMatchObject({ group: 'all' });
  });
});
