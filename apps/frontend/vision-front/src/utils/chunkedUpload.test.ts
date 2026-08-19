import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CHUNK_BYTES, uploadToSignedUrl } from './chunkedUpload';

interface FakeXhr {
  open: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number }) => void };
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  status: number;
  responseText: string;
}

const makeXhr = (): FakeXhr => ({
  open: vi.fn(),
  setRequestHeader: vi.fn(),
  send: vi.fn(),
  upload: {},
  status: 200,
  responseText: ''
});

/** Collects every XHR the code under test constructs, so each can be answered. */
const stubXhrQueue = (): FakeXhr[] => {
  const created: FakeXhr[] = [];
  vi.stubGlobal(
    'XMLHttpRequest',
    function XMLHttpRequestStub(this: unknown) {
      const xhr = makeXhr();
      created.push(xhr);
      return xhr;
    } as unknown as typeof XMLHttpRequest
  );
  return created;
};

/**
 * Wait for request #index to be opened. Bounded: an unbounded microtask spin
 * would hang the run rather than fail it if the request never arrives.
 */
const waitFor = async (created: FakeXhr[], index: number): Promise<FakeXhr> => {
  for (let tick = 0; created.length <= index && tick < 100; tick += 1) {
    await Promise.resolve();
  }
  if (created.length <= index) {
    throw new Error(`request ${index} was never opened`);
  }
  return created[index];
};

/** Wait for the Nth request, then complete it with a status + body. */
const answer = async (created: FakeXhr[], index: number, status: number, body?: object): Promise<FakeXhr> => {
  const xhr = await waitFor(created, index);
  xhr.status = status;
  xhr.responseText = body === undefined ? '' : JSON.stringify(body);
  xhr.onload!();
  await Promise.resolve();
  return xhr;
};

/**
 * jsdom's File keeps the whole body in memory, so multi-chunk cases fake the
 * size rather than allocating hundreds of megabytes.
 */
const makeFile = (size: number, type = 'application/zip'): File => {
  const file = new File(['x'], 'bundle.zip', { type });
  Object.defineProperty(file, 'size', { value: size });
  file.slice = vi.fn(() => new Blob(['chunk'])) as unknown as File['slice'];
  return file;
};

const rangeOf = (xhr: FakeXhr): string | undefined =>
  xhr.setRequestHeader.mock.calls.find((c) => c[0] === 'Content-Range')?.[1];

describe('uploadToSignedUrl', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('sends a small file as one un-ranged PUT', async () => {
    const created = stubXhrQueue();
    const promise = uploadToSignedUrl('http://upload', makeFile(1024));
    const xhr = await answer(created, 0, 200, { size: 1024 });
    await promise;

    expect(created).toHaveLength(1);
    expect(xhr.open).toHaveBeenCalledWith('PUT', 'http://upload');
    expect(rangeOf(xhr)).toBeUndefined();
  });

  it('sends one Content-Range chunk per CHUNK_BYTES slice, in order', async () => {
    const created = stubXhrQueue();
    const total = CHUNK_BYTES * 2 + 100;
    const promise = uploadToSignedUrl('http://upload', makeFile(total));

    const first = await answer(created, 0, 200, { size: CHUNK_BYTES });
    const second = await answer(created, 1, 200, { size: CHUNK_BYTES * 2 });
    const third = await answer(created, 2, 200, { size: total });
    await promise;

    expect(created).toHaveLength(3);
    expect([rangeOf(first), rangeOf(second), rangeOf(third)]).toEqual([
      `bytes 0-${CHUNK_BYTES - 1}/${total}`,
      `bytes ${CHUNK_BYTES}-${CHUNK_BYTES * 2 - 1}/${total}`,
      `bytes ${CHUNK_BYTES * 2}-${total - 1}/${total}`
    ]);
  });

  it('reports progress across the whole file, not per chunk', async () => {
    const created = stubXhrQueue();
    const total = CHUNK_BYTES * 2;
    const onProgress = vi.fn();
    const promise = uploadToSignedUrl('http://upload', makeFile(total), onProgress);

    // Half of the first chunk is a quarter of the file.
    (await waitFor(created, 0)).upload.onprogress!({ lengthComputable: true, loaded: CHUNK_BYTES / 2 });
    expect(onProgress).toHaveBeenLastCalledWith(0.25);

    await answer(created, 0, 200, { size: CHUNK_BYTES });
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    await answer(created, 1, 200, { size: total });
    await promise;

    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('never reports progress above 1 when a chunk over-reports bytes', async () => {
    const created = stubXhrQueue();
    const onProgress = vi.fn();
    const promise = uploadToSignedUrl('http://upload', makeFile(1000), onProgress);

    (await waitFor(created, 0)).upload.onprogress!({ lengthComputable: true, loaded: 1200 });
    await answer(created, 0, 200, { size: 1000 });
    await promise;

    expect(Math.max(...onProgress.mock.calls.map((c) => c[0] as number))).toBe(1);
  });

  it('resumes from the offset the server reports on a 409', async () => {
    const created = stubXhrQueue();
    const total = CHUNK_BYTES * 2;
    const promise = uploadToSignedUrl('http://upload', makeFile(total));

    await answer(created, 0, 409, { size: CHUNK_BYTES });
    const second = await answer(created, 1, 200, { size: total });
    await promise;

    expect(rangeOf(second)).toBe(`bytes ${CHUNK_BYTES}-${total - 1}/${total}`);
  });

  it('retries a 5xx chunk and succeeds when it lands', async () => {
    const created = stubXhrQueue();
    const total = CHUNK_BYTES + 1;
    const promise = uploadToSignedUrl('http://upload', makeFile(total));

    await answer(created, 0, 500);
    await answer(created, 1, 200, { size: CHUNK_BYTES });
    await answer(created, 2, 200, { size: total });
    await promise;

    expect(created).toHaveLength(3);
  });

  it('gives up immediately on a 4xx, which will never be accepted', async () => {
    const created = stubXhrQueue();
    const promise = uploadToSignedUrl('http://upload', makeFile(CHUNK_BYTES * 2));
    await answer(created, 0, 400);

    await expect(promise).rejects.toThrow('Failed to upload dataset file (400)');
    expect(created).toHaveLength(1);
  });

  it('surfaces a failed single-shot upload with its status', async () => {
    const created = stubXhrQueue();
    const promise = uploadToSignedUrl('http://upload', makeFile(1024));
    await answer(created, 0, 403);

    await expect(promise).rejects.toThrow('Failed to upload dataset file (403)');
  });

  it('gives up after repeated network failures on one chunk', async () => {
    const created = stubXhrQueue();
    const promise = uploadToSignedUrl('http://upload', makeFile(CHUNK_BYTES * 2));

    for (let i = 0; i < 4; i++) {
      (await waitFor(created, i)).onerror!();
      await Promise.resolve();
    }

    await expect(promise).rejects.toThrow('network');
    expect(created).toHaveLength(4);
  });

  it('gives up when the server keeps resynchronising to a different offset', async () => {
    const created = stubXhrQueue();
    const promise = uploadToSignedUrl('http://upload', makeFile(CHUNK_BYTES * 2));
    for (let i = 0; i < 4; i++) {
      await answer(created, i, 409, { size: 0 });
    }

    await expect(promise).rejects.toThrow('could not resynchronise with the server');
  });

  it('falls back to the chunk end when the reply carries no size', async () => {
    const created = stubXhrQueue();
    const total = CHUNK_BYTES + 10;
    const promise = uploadToSignedUrl('http://upload', makeFile(total));

    await answer(created, 0, 200);
    const second = await answer(created, 1, 200);
    await promise;

    expect(rangeOf(second)).toBe(`bytes ${CHUNK_BYTES}-${total - 1}/${total}`);
  });

  it('defaults the content type when the file has none', async () => {
    const created = stubXhrQueue();
    const promise = uploadToSignedUrl('http://upload', makeFile(1024, ''));
    const xhr = await answer(created, 0, 200, { size: 1024 });
    await promise;

    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
  });
});
