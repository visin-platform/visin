import { useMongo } from '../helpers/mongo';
useMongo();
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BadRequestError } from '@visin/backend-core';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  resolvePath,
  ensureDir,
  writeFile,
  createWriteStream,
  createWriteStreamAt,
  truncateFile,
  readFile,
  createReadStream,
  fileExists,
  getMetadata,
  deleteFile,
  deleteByPrefix,
  listFiles,
} from '../../utils/storage';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-test-'));
  process.env.FILE_SERVICE_DATA_DIR = dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.FILE_SERVICE_DATA_DIR;
});

describe('resolvePath', () => {
  it('falls back to /data when FILE_SERVICE_DATA_DIR is unset', async () => {
    delete process.env.FILE_SERVICE_DATA_DIR;

    expect(resolvePath('x/y.txt')).toBe(path.resolve('/data', 'x/y.txt'));
  });

  it('resolves a relative fileId under the data dir', async () => {
    expect(resolvePath('group/album/file.jpg')).toBe(path.join(dataDir, 'group/album/file.jpg'));
  });

  it('rejects path traversal with ..', async () => {
    expect(() => resolvePath('../outside.txt')).toThrow('escapes data directory');
  });

  it('rejects nested traversal that escapes the data dir', async () => {
    expect(() => resolvePath('group/../../outside.txt')).toThrow('escapes data directory');
  });

  it('reports rejected paths as client errors, including the reserved upload namespace', async () => {
    expect(() => resolvePath('../outside.txt')).toThrow(BadRequestError);
    expect(() => resolvePath('.uploads/state')).toThrow(BadRequestError);
  });

  it('allows a path that resolves to the data dir itself', async () => {
    expect(resolvePath('.')).toBe(path.resolve(dataDir));
  });
});

describe('write / read round-trip', () => {
  it('writes and reads a buffer', async () => {
    writeFile('a/b/test.bin', Buffer.from('hello'));

    expect((await readFile('a/b/test.bin')).toString()).toBe('hello');
  });

  it('ensureDir creates intermediate directories', async () => {
    ensureDir(path.join(dataDir, 'x/y/z/file.txt'));

    expect(fs.existsSync(path.join(dataDir, 'x/y/z'))).toBe(true);
  });

  it('createWriteStream + createReadStream stream a file', async () => {
    const ws = createWriteStream('stream/out.txt');
    await new Promise<void>((resolve, reject) => {
      ws.on('finish', resolve);
      ws.on('error', reject);
      ws.end('streamed');
    });

    const rs = (await createReadStream('stream/out.txt'));
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      rs.on('data', (c) => chunks.push(c as Buffer));
      rs.on('end', resolve);
      rs.on('error', reject);
    });

    expect(Buffer.concat(chunks).toString()).toBe('streamed');
  });
});

describe('createWriteStreamAt / truncateFile', () => {
  const writeAt = async (fileId: string, start: number, data: string): Promise<void> => {
    const ws = createWriteStreamAt(fileId, start);
    await new Promise<void>((resolve, reject) => {
      ws.on('finish', resolve);
      ws.on('error', reject);
      ws.end(data);
    });
  };

  it('appends a chunk without disturbing the bytes before it', async () => {
    writeFile('chunked/out.bin', Buffer.from('first-'));

    await writeAt('chunked/out.bin', 6, 'second');

    expect((await readFile('chunked/out.bin')).toString()).toBe('first-second');
  });

  it('overwrites in place when the same chunk is re-sent', async () => {
    writeFile('chunked/out.bin', Buffer.from('first-XXXXXX'));

    await writeAt('chunked/out.bin', 6, 'second');

    expect((await readFile('chunked/out.bin')).toString()).toBe('first-second');
  });

  it('fails rather than creating a file when the earlier chunks are missing', async () => {
    await expect(writeAt('chunked/absent.bin', 10, 'orphan')).rejects.toThrow();
    expect((await fileExists('chunked/absent.bin'))).toBe(false);
  });

  it('truncateFile cuts a file back to the given size', async () => {
    writeFile('chunked/trim.bin', Buffer.from('keep-drop'));

    truncateFile('chunked/trim.bin', 4);

    expect((await readFile('chunked/trim.bin')).toString()).toBe('keep');
  });
});

describe('fileExists / getMetadata', () => {
  it('reports existence correctly', async () => {
    writeFile('exists.txt', Buffer.from('x'));

    expect((await fileExists('exists.txt'))).toBe(true);
    expect((await fileExists('missing.txt'))).toBe(false);
  });

  it('returns false for a directory', async () => {
    writeFile('dir/file.txt', Buffer.from('x'));

    expect((await fileExists('dir'))).toBe(false);
  });

  it('returns size and mtime', async () => {
    writeFile('meta.txt', Buffer.from('12345'));

    const meta = (await getMetadata('meta.txt'));
    expect(meta.size).toBe(5);
    // fs.Stats dates come from Node's realm, not Jest's sandbox, so
    // instanceof Date fails — and fs mtime granularity can land a hair
    // ahead of Date.now(), so only assert it's a real timestamp.
    expect(Number.isFinite(meta.lastModified.getTime())).toBe(true);
  });
});

describe('deleteFile', () => {
  it('deletes an existing file', async () => {
    writeFile('del.txt', Buffer.from('x'));

    (await deleteFile('del.txt'));

    expect((await fileExists('del.txt'))).toBe(false);
  });

  it('is a no-op for a missing file', async () => {
    await expect(deleteFile('never-existed.txt')).resolves.toBeUndefined();
  });
});

describe('deleteByPrefix', () => {
  it('removes a whole directory subtree', async () => {
    writeFile('grp/alb/one.txt', Buffer.from('1'));
    writeFile('grp/alb/nested/two.txt', Buffer.from('2'));

    const count = (await deleteByPrefix('grp/alb'));

    expect(count).toBe(2);
    expect(fs.existsSync(path.join(dataDir, 'grp/alb'))).toBe(false);
  });

  it('removes files matching a filename prefix', async () => {
    writeFile('grp/photo_1.jpg', Buffer.from('1'));
    writeFile('grp/photo_2.jpg', Buffer.from('2'));
    writeFile('grp/other.jpg', Buffer.from('3'));

    const count = (await deleteByPrefix('grp/photo_'));

    expect(count).toBe(2);
    expect((await fileExists('grp/other.jpg'))).toBe(true);
  });

  it('returns 0 when the parent directory does not exist', async () => {
    expect((await deleteByPrefix('nowhere/file_'))).toBe(0);
  });
});

describe('listFiles', () => {
  it('lists all files recursively with data-dir-relative names', async () => {
    writeFile('a/one.txt', Buffer.from('1'));
    writeFile('a/b/two.txt', Buffer.from('22'));

    const files = (await listFiles());

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.name).sort()).toEqual([path.join('a', 'b', 'two.txt'), path.join('a', 'one.txt')]);
    expect(files.find((f) => f.name === path.join('a', 'b', 'two.txt'))?.size).toBe(2);
  });

  it('scopes listing to a prefix', async () => {
    writeFile('a/one.txt', Buffer.from('1'));
    writeFile('b/two.txt', Buffer.from('2'));

    const files = (await listFiles('b'));

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe(path.join('b', 'two.txt'));
  });

  it('caps results at maxKeys', async () => {
    writeFile('c/1.txt', Buffer.from('1'));
    writeFile('c/2.txt', Buffer.from('2'));
    writeFile('c/3.txt', Buffer.from('3'));

    expect((await listFiles('c', 2))).toHaveLength(2);
  });

  it('returns an empty list for a missing prefix directory', async () => {
    expect((await listFiles('missing-dir'))).toEqual([]);
  });
});
