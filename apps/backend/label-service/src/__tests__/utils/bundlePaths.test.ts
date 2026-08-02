import { classifyEntry, createEntryClassifier, normalizeFolder } from '../../utils/bundlePaths';

describe('classifyEntry', () => {
  it('classifies frames', () => {
    expect(classifyEntry('frames/frame_01.jpg')).toEqual({ type: 'frame', path: 'frames/frame_01.jpg', stem: 'frame_01' });
  });

  it('classifies layers, id maps, and masks.json per annotation set', () => {
    expect(classifyEntry('annotations/llava/frame_01.png')).toEqual({
      type: 'layer', path: 'annotations/llava/frame_01.png', stem: 'frame_01', set: 'llava'
    });
    expect(classifyEntry('annotations/llava/frame_01.ids.png')).toEqual({
      type: 'idmap', path: 'annotations/llava/frame_01.ids.png', stem: 'frame_01', set: 'llava'
    });
    expect(classifyEntry('annotations/llava/frame_01.masks.json')).toEqual({
      type: 'masksJson', path: 'annotations/llava/frame_01.masks.json', stem: 'frame_01', set: 'llava'
    });
  });

  it('still accepts the legacy ann/ folder name', () => {
    expect(classifyEntry('ann/llava/frame_01.png')).toEqual({
      type: 'layer', path: 'ann/llava/frame_01.png', stem: 'frame_01', set: 'llava'
    });
    expect(classifyEntry('bundle/ann/setA/a.ids.png')).toMatchObject({ type: 'idmap', set: 'setA' });
  });

  it('classifies manifests by extension', () => {
    expect(classifyEntry('manifest.csv')).toEqual({ type: 'manifest', path: 'manifest.csv', format: 'csv' });
    expect(classifyEntry('manifest.jsonl')).toEqual({ type: 'manifest', path: 'manifest.jsonl', format: 'jsonl' });
  });

  it('tolerates a single wrapping root directory', () => {
    expect(classifyEntry('bundle/frames/a.png')).toMatchObject({ type: 'frame', stem: 'a' });
    expect(classifyEntry('bundle/manifest.csv')).toMatchObject({ type: 'manifest' });
    expect(classifyEntry('bundle/annotations/setA/a.png')).toMatchObject({ type: 'layer', set: 'setA' });
  });

  it('rejects zip-slip attempts', () => {
    expect(classifyEntry('../evil.png').type).toBe('invalid');
    expect(classifyEntry('frames/../../evil.png').type).toBe('invalid');
    expect(classifyEntry('/etc/passwd').type).toBe('invalid');
  });

  it('silently ignores OS junk and directories', () => {
    expect(classifyEntry('__MACOSX/frames/a.png').type).toBe('ignored');
    expect(classifyEntry('frames/.DS_Store').type).toBe('ignored');
    expect(classifyEntry('frames/').type).toBe('ignored');
  });

  it('rejects unsupported locations and types with reasons', () => {
    expect(classifyEntry('extra/readme.txt')).toMatchObject({ type: 'invalid' });
    expect(classifyEntry('frames/movie.mp4')).toMatchObject({ type: 'invalid' });
    expect(classifyEntry('annotations/setA/layer.tiff')).toMatchObject({ type: 'invalid' });
    expect(classifyEntry('annotations/setA/deep/nested.png')).toMatchObject({ type: 'invalid' });
  });
});

describe('normalizeFolder', () => {
  it('strips leading ./ and trailing slashes and normalizes separators', () => {
    expect(normalizeFolder('./data/img/')).toBe('data/img');
    expect(normalizeFolder('data\\img')).toBe('data/img');
    expect(normalizeFolder('/data/')).toBe('data');
    expect(normalizeFolder('')).toBe('');
  });
});

describe('createEntryClassifier', () => {
  it('falls back to the default layout when no mapping is given', () => {
    expect(createEntryClassifier()('frames/a.png')).toMatchObject({ type: 'frame', stem: 'a' });
  });

  it('routes entries by the mapped folders, not the default names', () => {
    const classify = createEntryClassifier({
      frames: 'dataset/img',
      annotations: [{ path: 'dataset/masks/llava', set: 'llava' }],
      manifest: 'dataset/list.csv'
    });

    expect(classify('dataset/img/0001.jpg')).toEqual({
      type: 'frame', path: 'dataset/img/0001.jpg', stem: '0001'
    });
    expect(classify('dataset/masks/llava/0001.png')).toEqual({
      type: 'layer', path: 'dataset/masks/llava/0001.png', stem: '0001', set: 'llava'
    });
    expect(classify('dataset/masks/llava/0001.ids.png')).toMatchObject({ type: 'idmap', set: 'llava' });
    expect(classify('dataset/masks/llava/0001.masks.json')).toMatchObject({ type: 'masksJson', set: 'llava' });
    expect(classify('dataset/list.csv')).toEqual({ type: 'manifest', path: 'dataset/list.csv', format: 'csv' });
    // The default folders carry no special meaning once a mapping is in play.
    expect(classify('frames/a.png')).toMatchObject({ type: 'invalid', reason: 'Not covered by the import mapping' });
  });

  it('honours custom id-map and masks suffixes', () => {
    const classify = createEntryClassifier({
      frames: 'img',
      annotations: [{ path: 'seg', set: 'sam' }],
      idsSuffix: '_id.png',
      masksSuffix: '_meta.json'
    });

    expect(classify('seg/0001_id.png')).toMatchObject({ type: 'idmap', stem: '0001', set: 'sam' });
    expect(classify('seg/0001_meta.json')).toMatchObject({ type: 'masksJson', stem: '0001', set: 'sam' });
    expect(classify('seg/0001.png')).toMatchObject({ type: 'layer', stem: '0001' });
    expect(classify('seg/0001.txt')).toMatchObject({
      type: 'invalid', reason: 'Annotation layers must be .png (or _id.png / _meta.json)'
    });
  });

  it('supports frames at the zip root and a manifest beside them', () => {
    const classify = createEntryClassifier({ frames: '', manifest: 'list.jsonl' });

    expect(classify('0001.jpg')).toMatchObject({ type: 'frame', stem: '0001' });
    expect(classify('list.jsonl')).toMatchObject({ type: 'manifest', format: 'jsonl' });
    expect(classify('sub/0001.jpg')).toMatchObject({ type: 'invalid' });
  });

  it('prefers the deepest matching annotation folder over a frames folder above it', () => {
    const classify = createEntryClassifier({
      frames: 'data',
      annotations: [
        { path: 'other', set: 'b' },
        { path: 'data/ann', set: 'a' }
      ]
    });

    expect(classify('data/0001.jpg')).toMatchObject({ type: 'frame' });
    expect(classify('data/ann/0001.png')).toMatchObject({ type: 'layer', set: 'a' });
    expect(classify('other/0001.png')).toMatchObject({ type: 'layer', set: 'b' });
  });

  it('still rejects zip-slip, junk, and unsupported frame types under a mapping', () => {
    const classify = createEntryClassifier({ frames: 'img', manifest: 'notes.txt' });

    expect(classify('../evil.png').type).toBe('invalid');
    expect(classify('__MACOSX/img/a.png').type).toBe('ignored');
    expect(classify('img/movie.mp4')).toMatchObject({ type: 'invalid', reason: 'Unsupported frame type .mp4' });
    expect(classify('notes.txt')).toMatchObject({ type: 'invalid', reason: 'Manifest must be .csv or .jsonl' });
  });

  it('accepts mapped folders written with trailing slashes or backslashes', () => {
    const classify = createEntryClassifier({ frames: 'img/', annotations: [{ path: 'data\\ann', set: 'a' }] });

    expect(classify('img/a.png')).toMatchObject({ type: 'frame' });
    expect(classify('data/ann/a.png')).toMatchObject({ type: 'layer', set: 'a' });
  });
});
