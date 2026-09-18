import { describe, expect, it } from 'vitest';
import { directCounts, folderLabel, folderName, formatBytes, suggestMapping, visibleFolders } from './datasetMapping';
import type { ContentsFolder, DatasetContents } from '../services/datasetService';

const folder = (path: string, images: number, jsons = 0): ContentsFolder => ({
  path,
  depth: path === '' ? 0 : path.split('/').length,
  files: images + jsons,
  images,
  jsons,
  bytes: 0
});
const contents = (folders: ContentsFolder[]): DatasetContents => ({ entries: 0, totalBytes: 0, truncated: false, folders, extensions: [] });

describe('datasetMapping', () => {
  it('formats sizes and folder labels', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3.6 * 1024 ** 3)).toBe('3.6 GB');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(folderLabel('')).toBe('(zip root)');
    expect(folderLabel('a/b')).toBe('a/b');
  });

  it('derives what sits directly in each folder', () => {
    const direct = directCounts([folder('', 5, 1), folder('a', 5, 1), folder('a/b', 3)]);
    expect(direct.get('')).toEqual({ images: 0, jsons: 0 });
    expect(direct.get('a')).toEqual({ images: 2, jsons: 1 });
    expect(direct.get('a/b')).toEqual({ images: 3, jsons: 0 });
  });

  it('suggests a group per folder name holding images, one group for same-named folders', () => {
    expect(suggestMapping(undefined)).toEqual([]);
    expect(suggestMapping(contents([folder('', 0), folder('lidar', 0)]))).toEqual([]);
    expect(
      suggestMapping(contents([folder('', 4, 1), folder('annotations', 2, 1), folder('annotations/verify', 2, 1), folder('frames', 2), folder('x', 0), folder('x/frames', 0)]))
    ).toEqual([
      { folder: 'annotations/verify', group: 'verify' },
      { folder: 'frames', group: 'frames' }
    ]);
    expect(suggestMapping(contents([folder('', 2), folder('a', 1), folder('a/cam', 1), folder('b', 1), folder('b/cam', 1)]))).toEqual([
      { folder: 'a/cam', group: 'cam' },
      { folder: 'b/cam', group: 'cam' }
    ]);
  });

  it('suggests one group per kind of image for a zip split by condition, like Waymo', () => {
    const conditions = ['day/not_rain', 'day/rain', 'night/not_rain', 'night/rain'];
    const leaves = conditions.flatMap((condition) =>
      ['annotation', 'camera', 'lidar_png'].map((kind) => folder(`waymo_dataset/labeled/${condition}/${kind}`, 10))
    );
    const between = ['waymo_dataset/labeled', 'waymo_dataset/labeled/day', 'waymo_dataset/labeled/night', ...conditions.map((c) => `waymo_dataset/labeled/${c}`)];
    const counts = (path: string) => leaves.filter((leaf) => leaf.path.startsWith(`${path}/`)).length * 10;
    const suggested = suggestMapping(
      contents([folder('', 120), folder('waymo_dataset', 120), folder('waymo_dataset/splits_clft', 0), ...between.map((path) => folder(path, counts(path))), ...leaves])
    );
    expect(suggested).toHaveLength(12);
    expect(new Set(suggested.map((row) => row.group))).toEqual(new Set(['annotation', 'camera', 'lidar_png']));
    expect(suggested).toContainEqual({ folder: 'waymo_dataset/labeled/night/rain/camera', group: 'camera' });
  });

  it('lists every folder level while it fits, then leaves out the deepest', () => {
    const tree = [folder('', 3), folder('a', 3), folder('a/b', 3), folder('a/b/c', 3), folder('z', 0)];
    expect(visibleFolders(tree, 10)).toEqual({ rows: [tree[1], tree[2], tree[3], tree[4]], omittedDeeper: false });
    expect(visibleFolders(tree, 3)).toEqual({ rows: [tree[1], tree[2], tree[4]], omittedDeeper: true });
    expect(visibleFolders(tree, 1).rows.map((row) => row.path)).toEqual(['a', 'z']);
    expect(folderName('a/b/c')).toBe('c');
    expect(folderName('')).toBe('(zip root)');
  });

  it('falls back to top-level folders when a zip has a folder per sequence', () => {
    const sequences = Array.from({ length: 40 }, (_, i) => folder(`segments/s${i}`, 1));
    const suggested = suggestMapping(contents([folder('', 40), folder('segments', 40), ...sequences, folder('lidar', 0)]));
    expect(suggested).toEqual([{ folder: 'segments', group: 'segments' }]);

    const withRootImage = suggestMapping(contents([folder('', 41), folder('segments', 40), ...sequences]));
    expect(withRootImage).toEqual([{ folder: '', group: 'root' }, { folder: 'segments', group: 'segments' }]);
  });
});
