import fs from 'fs';
import os from 'os';
import path from 'path';

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
  it('falls back to /data when FILE_SERVICE_DATA_DIR is unset', () => {
    delete process.env.FILE_SERVICE_DATA_DIR;

    expect(resolvePath('x/y.txt')).toBe(path.resolve('/data', 'x/y.txt'));
  });

  it('resolves a relative fileId under the data dir', () => {
    expect(resolvePath('group/album/file.jpg')).toBe(path.join(dataDir, 'group/album/file.jpg'));
  });

  it('rejects path traversal with ..', () => {
    expect(() => resolvePath('../outside.txt')).toThrow('escapes data directory');
  });

  it('rejects nested traversal that escapes the data dir', () => {
    expect(() => resolvePath('group/../../outside.txt')).toThrow('escapes data directory');
  });

  it('allows a path that resolves to the data dir itself', () => {
    expect(resolvePath('.')).toBe(path.resolve(dataDir));
  });
});

describe('write / read round-trip', () => {
  it('writes and reads a buffer', () => {
    writeFile('a/b/test.bin', Buffer.from('hello'));

    expect(readFile('a/b/test.bin').toString()).toBe('hello');
  });

  it('ensureDir creates intermediate directories', () => {
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

    const rs = createReadStream('stream/out.txt');
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

    expect(readFile('chunked/out.bin').toString()).toBe('first-second');
  });

  it('overwrites in place when the same chunk is re-sent', async () => {
    writeFile('chunked/out.bin', Buffer.from('first-XXXXXX'));

    await writeAt('chunked/out.bin', 6, 'second');

    expect(readFile('chunked/out.bin').toString()).toBe('first-second');
  });

  it('fails rather than creating a file when the earlier chunks are missing', async () => {
    await expect(writeAt('chunked/absent.bin', 10, 'orphan')).rejects.toThrow();
    expect(fileExists('chunked/absent.bin')).toBe(false);
  });

  it('truncateFile cuts a file back to the given size', () => {
    writeFile('chunked/trim.bin', Buffer.from('keep-drop'));

    truncateFile('chunked/trim.bin', 4);

    expect(readFile('chunked/trim.bin').toString()).toBe('keep');
  });
});

describe('fileExists / getMetadata', () => {
  it('reports existence correctly', () => {
    writeFile('exists.txt', Buffer.from('x'));

    expect(fileExists('exists.txt')).toBe(true);
    expect(fileExists('missing.txt')).toBe(false);
  });

  it('returns false for a directory', () => {
    writeFile('dir/file.txt', Buffer.from('x'));

    expect(fileExists('dir')).toBe(false);
  });

  it('returns size and mtime', () => {
    writeFile('meta.txt', Buffer.from('12345'));

    const meta = getMetadata('meta.txt');
    expect(meta.size).toBe(5);
    // fs.Stats dates come from Node's realm, not Jest's sandbox, so
    // instanceof Date fails — and fs mtime granularity can land a hair
    // ahead of Date.now(), so only assert it's a real timestamp.
    expect(Number.isFinite(meta.lastModified.getTime())).toBe(true);
  });
});

describe('deleteFile', () => {
  it('deletes an existing file', () => {
    writeFile('del.txt', Buffer.from('x'));

    deleteFile('del.txt');

    expect(fileExists('del.txt')).toBe(false);
  });

  it('is a no-op for a missing file', () => {
    expect(() => deleteFile('never-existed.txt')).not.toThrow();
  });
});

describe('deleteByPrefix', () => {
  it('removes a whole directory subtree', () => {
    writeFile('grp/alb/one.txt', Buffer.from('1'));
    writeFile('grp/alb/nested/two.txt', Buffer.from('2'));

    const count = deleteByPrefix('grp/alb');

    expect(count).toBe(2);
    expect(fs.existsSync(path.join(dataDir, 'grp/alb'))).toBe(false);
  });

  it('removes files matching a filename prefix', () => {
    writeFile('grp/photo_1.jpg', Buffer.from('1'));
    writeFile('grp/photo_2.jpg', Buffer.from('2'));
    writeFile('grp/other.jpg', Buffer.from('3'));

    const count = deleteByPrefix('grp/photo_');

    expect(count).toBe(2);
    expect(fileExists('grp/other.jpg')).toBe(true);
  });

  it('returns 0 when the parent directory does not exist', () => {
    expect(deleteByPrefix('nowhere/file_')).toBe(0);
  });
});

describe('listFiles', () => {
  it('lists all files recursively with data-dir-relative names', () => {
    writeFile('a/one.txt', Buffer.from('1'));
    writeFile('a/b/two.txt', Buffer.from('22'));

    const files = listFiles();

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.name).sort()).toEqual([path.join('a', 'b', 'two.txt'), path.join('a', 'one.txt')]);
    expect(files.find((f) => f.name === path.join('a', 'b', 'two.txt'))?.size).toBe(2);
  });

  it('scopes listing to a prefix', () => {
    writeFile('a/one.txt', Buffer.from('1'));
    writeFile('b/two.txt', Buffer.from('2'));

    const files = listFiles('b');

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe(path.join('b', 'two.txt'));
  });

  it('caps results at maxKeys', () => {
    writeFile('c/1.txt', Buffer.from('1'));
    writeFile('c/2.txt', Buffer.from('2'));
    writeFile('c/3.txt', Buffer.from('3'));

    expect(listFiles('c', 2)).toHaveLength(2);
  });

  it('returns an empty list for a missing prefix directory', () => {
    expect(listFiles('missing-dir')).toEqual([]);
  });
});
