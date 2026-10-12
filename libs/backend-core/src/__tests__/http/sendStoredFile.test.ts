import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { Readable } from 'stream';
import express from 'express';
import { errorHandler } from '../../middleware/errorHandler';
import { sendStoredFile, storedFileTag, type StoredFile } from '../../http/sendStoredFile';

const data = Buffer.from(Array.from({ length: 1024 }, (_, index) => index % 251));
const version = new Date('2026-10-12T09:27:04Z');

let server: Server;
let baseUrl: string;
let file: StoredFile;
let opened: Array<{ start: number; end: number } | undefined>;

const store = (overrides: Partial<StoredFile> = {}): StoredFile => ({
  filename: 'model.onnx',
  contentType: 'application/octet-stream',
  size: data.length,
  version,
  open: async (range) => {
    opened.push(range);
    return Readable.from([range ? data.subarray(range.start, range.end + 1) : data]);
  },
  ...overrides
});

beforeAll(async () => {
  const app = express();
  app.get('/file', (req, res, next) => sendStoredFile(req, res, file).catch(next));
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/file`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  opened = [];
  file = store();
});

const get = (headers: Record<string, string> = {}, method = 'GET') => fetch(baseUrl, { method, headers });

describe('sendStoredFile', () => {
  it('sends the whole file, named, sized and versioned', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="model.onnx"');
    expect(response.headers.get('content-length')).toBe('1024');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('etag')).toBe(storedFileTag(version));
    expect(response.headers.get('last-modified')).toBe('Mon, 12 Oct 2026 09:27:04 GMT');
    expect(Buffer.from(await response.arrayBuffer()).equals(data)).toBe(true);
    expect(opened).toEqual([undefined]);
  });

  it('keeps the tag the deployed archives already carry', () => {
    expect(storedFileTag(new Date('2026-10-12T09:27:04.471Z'))).toBe('"mv51sys7"');
  });

  it('sends extra headers the caller names', async () => {
    file = store({ headers: { 'Repr-Digest': 'sha-256=:abc=:' } });
    expect((await get()).headers.get('repr-digest')).toBe('sha-256=:abc=:');
  });

  it('resumes from an offset, or any one range', async () => {
    const rest = await get({ Range: 'bytes=100-' });
    expect(rest.status).toBe(206);
    expect(rest.headers.get('content-range')).toBe('bytes 100-1023/1024');
    expect(rest.headers.get('content-length')).toBe('924');
    expect(Buffer.from(await rest.arrayBuffer()).equals(data.subarray(100))).toBe(true);
    expect(opened).toEqual([{ start: 100, end: 1023 }]);

    const tail = await get({ Range: 'bytes=-24' });
    expect(Buffer.from(await tail.arrayBuffer()).equals(data.subarray(1000))).toBe(true);
  });

  it('resumes only the same version of the file', async () => {
    const tag = storedFileTag(version);
    expect((await get({ Range: 'bytes=100-', 'If-Range': tag })).status).toBe(206);
    expect((await get({ Range: 'bytes=100-', 'If-Range': version.toUTCString() })).status).toBe(206);
    const replaced = await get({ Range: 'bytes=100-', 'If-Range': '"older"' });
    expect(replaced.status).toBe(200);
    expect(Buffer.from(await replaced.arrayBuffer()).equals(data)).toBe(true);
  });

  it('sends the whole file for several ranges or a header it cannot read, and refuses one past the end', async () => {
    for (const header of ['bytes=0-9,20-29', 'bytes=abc', 'lines=1-2']) {
      const whole = await get({ Range: header });
      expect(whole.status).toBe(200);
      expect((await whole.arrayBuffer()).byteLength).toBe(1024);
    }
    const past = await get({ Range: 'bytes=2000-' });
    expect(past.status).toBe(416);
    expect(past.headers.get('content-range')).toBe('bytes */1024');
  });

  it('sends a file with no recorded size whole and chunked, even when a range is asked for', async () => {
    file = store({ size: undefined });
    const response = await get({ Range: 'bytes=4-' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('accept-ranges')).toBeNull();
    expect((await response.arrayBuffer()).byteLength).toBe(1024);
  });

  it('answers HEAD with the headers alone, reading nothing', async () => {
    const head = await get({}, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('1024');
    const partial = await get({ Range: 'bytes=1000-' }, 'HEAD');
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 1000-1023/1024');
    expect(opened).toEqual([]);
  });

  it('omits validators for a generated stream without a stable version', async () => {
    file = store({ size: undefined, version: undefined });
    const response = await get({ Range: 'bytes=4-' });
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('last-modified')).toBeNull();
    expect(response.headers.get('accept-ranges')).toBeNull();
    expect((await response.arrayBuffer()).byteLength).toBe(1024);
  });

  it('sends a known empty file with a zero content length and refuses byte ranges', async () => {
    file = store({ size: 0, open: async () => Readable.from([]) });
    expect((await get()).headers.get('content-length')).toBe('0');
    expect((await get({ Range: 'bytes=0-' })).status).toBe(416);
  });

  it('cannot put a quote or a line break into the saved name', async () => {
    file = store({ filename: 'a"b\r\nc.onnx' });
    expect((await get()).headers.get('content-disposition')).toBe('attachment; filename="a_b__c.onnx"');
  });

  it('answers with an error, before any byte, when storage cannot be opened', async () => {
    file = store({
      open: async () => {
        throw Object.assign(new Error('storage down'), { statusCode: 502 });
      }
    });
    expect((await get()).status).toBe(500);
  });

  it('cuts the response short when storage fails part way, rather than end it as if whole', async () => {
    file = store({
      open: async () =>
        new Readable({
          read() {
            this.push(Buffer.alloc(100));
            this.destroy(new Error('storage went away'));
          }
        })
    });
    await expect(get().then((response) => response.arrayBuffer())).rejects.toThrow();
  });
});
