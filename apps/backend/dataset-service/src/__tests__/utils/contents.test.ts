import { expectedImportFiles, summarizeContents } from '../../utils/contents';

it('counts every folder with everything beneath it, including empty ancestors', () => {
  const contents = summarizeContents([
    { path: 'segments/a/camera/1.png', size: 10 },
    { path: 'segments/a/camera/1.masks.json', size: 2 },
    { path: 'segments/b/lidar/1.bin', size: 100 },
    { path: 'README', size: 1 },
    { path: '__MACOSX/x', size: 5 },
    { path: '../escape.png', size: 5 }
  ]);
  expect(contents.entries).toBe(4);
  expect(contents.totalBytes).toBe(113);
  expect(contents.truncated).toBe(false);
  const byPath = Object.fromEntries(contents.folders.map((folder) => [folder.path, folder]));
  expect(byPath['']).toMatchObject({ depth: 0, files: 4, images: 1, jsons: 1, bytes: 113 });
  expect(byPath.segments).toMatchObject({ depth: 1, files: 3, images: 1, bytes: 112 });
  expect(byPath['segments/a/camera']).toMatchObject({ depth: 3, files: 2 });
  expect(contents.extensions[0]).toEqual({ ext: '.png', files: 1, bytes: 10 });
  expect(contents.extensions.map((ext) => ext.ext).sort()).toEqual(['(none)', '.bin', '.json', '.png']);
});

it('keeps the shallowest folders when there are too many', () => {
  const entries = Array.from({ length: 2100 }, (_, index) => ({ path: `root/leaf${index}/f.png`, size: Number.NaN }));
  const contents = summarizeContents(entries);
  expect(contents.truncated).toBe(true);
  expect(contents.folders).toHaveLength(2000);
  expect(contents.folders.map((folder) => folder.path)).toEqual(expect.arrayContaining(['', 'root']));
  expect(contents.totalBytes).toBe(0);
});

it('expects the files beneath the mapped folders, counting nested mappings once', () => {
  const contents = summarizeContents([
    { path: 'set/camera/1.png', size: 1 },
    { path: 'set/camera/2.png', size: 1 },
    { path: 'set/camera/verify/3.png', size: 1 },
    { path: 'set/masks/1.json', size: 1 },
    { path: 'set/readme.txt', size: 1 }
  ]);
  expect(expectedImportFiles(contents, ['set/camera'])).toBe(3);
  expect(expectedImportFiles(contents, ['set/camera', 'set/camera/verify', 'set/masks'])).toBe(4);
  expect(expectedImportFiles(contents, [''])).toBe(4);
  expect(expectedImportFiles(contents, ['nowhere'])).toBe(0);
  expect(expectedImportFiles({ ...contents, truncated: true }, ['set/camera'])).toBeUndefined();
  expect(expectedImportFiles(undefined, ['set/camera'])).toBeUndefined();
});
