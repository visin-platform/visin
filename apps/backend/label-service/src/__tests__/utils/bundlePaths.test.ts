import { classifyEntry } from '../../utils/bundlePaths';

describe('classifyEntry', () => {
  it('classifies frames', () => {
    expect(classifyEntry('frames/frame_01.jpg')).toEqual({ type: 'frame', path: 'frames/frame_01.jpg', stem: 'frame_01' });
  });

  it('classifies layers, id maps, and masks.json per annotation set', () => {
    expect(classifyEntry('ann/llava/frame_01.png')).toEqual({
      type: 'layer', path: 'ann/llava/frame_01.png', stem: 'frame_01', set: 'llava'
    });
    expect(classifyEntry('ann/llava/frame_01.ids.png')).toEqual({
      type: 'idmap', path: 'ann/llava/frame_01.ids.png', stem: 'frame_01', set: 'llava'
    });
    expect(classifyEntry('ann/llava/frame_01.masks.json')).toEqual({
      type: 'masksJson', path: 'ann/llava/frame_01.masks.json', stem: 'frame_01', set: 'llava'
    });
  });

  it('classifies manifests by extension', () => {
    expect(classifyEntry('manifest.csv')).toEqual({ type: 'manifest', path: 'manifest.csv', format: 'csv' });
    expect(classifyEntry('manifest.jsonl')).toEqual({ type: 'manifest', path: 'manifest.jsonl', format: 'jsonl' });
  });

  it('tolerates a single wrapping root directory', () => {
    expect(classifyEntry('bundle/frames/a.png')).toMatchObject({ type: 'frame', stem: 'a' });
    expect(classifyEntry('bundle/manifest.csv')).toMatchObject({ type: 'manifest' });
    expect(classifyEntry('bundle/ann/setA/a.png')).toMatchObject({ type: 'layer', set: 'setA' });
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
    expect(classifyEntry('ann/setA/layer.tiff')).toMatchObject({ type: 'invalid' });
    expect(classifyEntry('ann/setA/deep/nested.png')).toMatchObject({ type: 'invalid' });
  });
});
