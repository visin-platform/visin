import { extensionOf, folderOf, mimetypeFor, normalizeEntryPath, normalizeFolder, stemAndVariant } from '../../utils/zipPaths';

describe('normalizeEntryPath', () => {
  it.each([
    ['a/b.png', { ok: true, path: 'a/b.png' }],
    ['a\\b.png', { ok: true, path: 'a/b.png' }],
    ['/a/b.png', { ok: false, reason: 'unsafe' }],
    ['../b.png', { ok: false, reason: 'unsafe' }],
    ['a/../../b.png', { ok: false, reason: 'unsafe' }],
    ['a/', { ok: false, reason: 'directory' }],
    ['__MACOSX/a/._b.png', { ok: false, reason: 'junk' }],
    ['a/.DS_Store', { ok: false, reason: 'junk' }]
  ])('%s', (raw, expected) => {
    expect(normalizeEntryPath(raw)).toEqual(expected);
  });
});

describe('stemAndVariant', () => {
  it.each([
    ['frames/frame_000012.jpg', { stem: 'frame_000012' }],
    ['a/frame_000012.ids.png', { stem: 'frame_000012', variant: 'ids' }],
    ['a/frame_000012.masks.json', { stem: 'frame_000012', variant: 'masks' }],
    ['frame.000012.png', { stem: 'frame.000012' }],
    ['img.2023.jpg', { stem: 'img.2023' }],
    ['README', { stem: 'README' }],
    // One frame seen by three sensors, one group each: a label job joins them on the stem.
    ['camera/0001.jpg', { stem: '0001' }],
    ['lidar/0001.png', { stem: '0001' }],
    ['radar/0001.json', { stem: '0001' }],
    // ...or side by side in one group, told apart by their variant.
    ['scene/0001.lidar.png', { stem: '0001', variant: 'lidar' }],
    ['scene/0001.radar.json', { stem: '0001', variant: 'radar' }]
  ])('%s', (filePath, expected) => {
    expect(stemAndVariant(filePath)).toEqual(expected);
  });
});

it('reads folders, extensions and media types', () => {
  expect(normalizeFolder('./a/b/')).toBe('a/b');
  expect(normalizeFolder('')).toBe('');
  expect(folderOf('a/b/c.png')).toBe('a/b');
  expect(folderOf('c.png')).toBe('');
  expect(extensionOf('A.PNG')).toBe('.png');
  expect(mimetypeFor('a.jpeg')).toBe('image/jpeg');
  expect(mimetypeFor('a.bin')).toBe('application/octet-stream');
});
