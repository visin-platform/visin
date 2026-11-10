import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { vi } from 'vitest';

const net = vi.hoisted(() => ({ get: vi.fn(), lookup: vi.fn() }));
vi.mock('node:https', () => ({ default: { get: net.get } }));
vi.mock('node:dns', () => ({ default: { lookup: net.lookup } }));

import { BadGatewayError, BadRequestError, GatewayTimeoutError } from '@visin/backend-core';
import { MAX_PDF_BYTES, fetchPdf } from '../../services/paperPdfFetch';

type Reply = { status?: number; headers?: Record<string, string>; chunks?: Buffer[]; error?: Error };

/** The next requests answer in turn: each reply is what one hop of the download receives. */
const answer = (...replies: Reply[]) => {
  const queue = [...replies];
  net.get.mockImplementation((_url: URL, _options: unknown, callback: (response: Readable) => void) => {
    const request = new EventEmitter();
    const reply = queue.shift() ?? { status: 500 };
    setImmediate(() => {
      if (reply.error) return request.emit('error', reply.error);
      const response = Object.assign(Readable.from(reply.chunks ?? []), {
        statusCode: reply.status ?? 200,
        headers: reply.headers ?? {}
      });
      callback(response);
    });
    return request;
  });
};
const pdf = Buffer.from('%PDF-1.4\nbody\n%%EOF');
const ok = (headers: Record<string, string> = { 'content-type': 'application/pdf' }): Reply => ({
  headers,
  chunks: [pdf]
});

beforeEach(() => {
  net.get.mockReset();
});

describe('fetchPdf', () => {
  it('reads a PDF and says where it came from', async () => {
    answer(ok());
    const { bytes, finalUrl } = await fetchPdf('https://papers.example.test/a.pdf');
    expect(bytes.equals(pdf)).toBe(true);
    expect(finalUrl).toBe('https://papers.example.test/a.pdf');
  });

  it('accepts a PDF served as a generic download, or with no type at all', async () => {
    answer(ok({ 'content-type': 'application/octet-stream' }), ok({}));
    await expect(fetchPdf('https://papers.example.test/a.pdf')).resolves.toBeDefined();
    await expect(fetchPdf('https://papers.example.test/b.pdf')).resolves.toBeDefined();
  });

  it('follows a few redirects, each checked as strictly as the first address', async () => {
    answer(
      { status: 302, headers: { location: '/moved.pdf' } },
      { status: 301, headers: { location: 'https://cdn.example.test/final.pdf' } },
      ok()
    );
    expect((await fetchPdf('https://papers.example.test/a.pdf')).finalUrl).toBe('https://cdn.example.test/final.pdf');

    answer({ status: 302, headers: { location: 'http://papers.example.test/plain.pdf' } });
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toThrow('must be https');
    answer({ status: 302, headers: { location: 'https://127.0.0.1/inside.pdf' } });
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('gives up on a loop of redirects', async () => {
    answer(
      ...Array.from({ length: 6 }, () => ({
        status: 302,
        headers: { location: 'https://papers.example.test/again.pdf' }
      }))
    );
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toThrow('redirected too many times');
  });

  it('reports the publisher’s refusal rather than a PDF it did not give', async () => {
    answer({ status: 404 });
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toThrow("The PDF's server answered 404");
  });

  it('refuses a web page, a paywall or a file that only claims to be a PDF', async () => {
    answer({ headers: { 'content-type': 'text/html' }, chunks: [Buffer.from('<html>sign in</html>')] });
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toThrow('did not return a PDF');
    answer({ headers: { 'content-type': 'text/html' }, chunks: [pdf] });
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toThrow('did not return a PDF');
  });

  it('refuses one too large, whether it says so or only turns out to be', async () => {
    answer({
      headers: { 'content-type': 'application/pdf', 'content-length': String(MAX_PDF_BYTES + 1) },
      chunks: [pdf]
    });
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toThrow('too large');
    const slab = Buffer.alloc(MAX_PDF_BYTES / 2 + 1);
    answer({ headers: { 'content-type': 'application/pdf' }, chunks: [slab, slab] });
    await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toThrow('too large');
  });

  it('says what went wrong when the connection fails, without the system’s own words', async () => {
    answer({ error: Object.assign(new Error('getaddrinfo ENOTFOUND 10.1.2.3'), { code: 'ENOTFOUND' }) });
    const failure = await fetchPdf('https://papers.example.test/a.pdf').catch((error: Error) => error);
    expect(failure).toBeInstanceOf(BadGatewayError);
    expect((failure as Error).message).toBe('The PDF could not be downloaded');
  });

  it('says so when the address was refused on the connection, because it names a private place', async () => {
    answer({ error: Object.assign(new Error('x'), { code: 'EPUBLICONLY' }) });
    await expect(fetchPdf('https://rebinding.example.test/a.pdf')).rejects.toThrow('not on the public internet');
  });

  it('stops at its deadline', async () => {
    const deadline = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
    answer({ error: new Error('aborted') });
    try {
      await expect(fetchPdf('https://papers.example.test/a.pdf')).rejects.toBeInstanceOf(GatewayTimeoutError);
    } finally {
      deadline.mockRestore();
    }
  });
});

describe('the lookup a connection uses', () => {
  /** The lookup the request was given: the one the socket resolves the name with. */
  const lookupOfRequest = async () => {
    answer(ok());
    await fetchPdf('https://papers.example.test/a.pdf');
    return net.get.mock.calls[0][1].lookup as (host: string, options: object, cb: (...args: unknown[]) => void) => void;
  };
  const resolve = (lookup: Awaited<ReturnType<typeof lookupOfRequest>>, options: object) =>
    new Promise<unknown[]>((done) => lookup('papers.example.test', options, (...args) => done(args)));

  it('connects only to public addresses, as a list or as one', async () => {
    const lookup = await lookupOfRequest();
    net.lookup.mockImplementation((_host: string, _options: object, cb: (e: null, a: unknown) => void) =>
      cb(null, [
        { address: '10.0.0.5', family: 4 },
        { address: '93.184.216.34', family: 4 }
      ])
    );
    expect(await resolve(lookup, { all: true })).toEqual([null, [{ address: '93.184.216.34', family: 4 }]]);
    expect(await resolve(lookup, {})).toEqual([null, '93.184.216.34', 4]);
  });

  it('refuses a name that resolves only to private places, however it is spelled', async () => {
    const lookup = await lookupOfRequest();
    net.lookup.mockImplementation((_host: string, _options: object, cb: (e: null, a: unknown) => void) =>
      cb(null, [
        { address: '127.0.0.1', family: 4 },
        { address: '::ffff:10.0.0.1', family: 6 }
      ])
    );
    const [error] = (await resolve(lookup, { all: true })) as [NodeJS.ErrnoException];
    expect(error.code).toBe('EPUBLICONLY');
  });

  it('passes a failed lookup on as it is', async () => {
    const lookup = await lookupOfRequest();
    const failure = Object.assign(new Error('nope'), { code: 'ENOTFOUND' });
    net.lookup.mockImplementation((_host: string, _options: object, cb: (e: Error) => void) => cb(failure));
    expect((await resolve(lookup, {}))[0]).toBe(failure);
  });
});
