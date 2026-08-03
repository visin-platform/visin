import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./labelApiClient', () => ({
  labelApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { labelApi } from './labelApiClient';
import {
  createBundle,
  deleteBundle,
  getBundle,
  getImport,
  getUploadUrl,
  listBundles,
  listUploads,
  previewImport,
  startImport,
  updateBundle,
  uploadZip,
} from './bundleService';

const mockedApi = labelApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bundleService', () => {
  it('covers the CRUD + import endpoints', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: [] });
    mockedApi.post.mockResolvedValue({ success: true, data: { _id: 'b1' } });

    await listBundles();
    expect(mockedApi.get).toHaveBeenCalledWith('/bundles');

    await getBundle('b1');
    expect(mockedApi.get).toHaveBeenCalledWith('/bundles/b1');

    await createBundle({ name: 'B', groupId: 'g1' });
    expect(mockedApi.post).toHaveBeenCalledWith('/bundles', { name: 'B', groupId: 'g1' });

    await deleteBundle('b1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/bundles/b1');

    await getUploadUrl('b1');
    expect(mockedApi.post).toHaveBeenCalledWith('/bundles/b1/upload-url');

    mockedApi.patch.mockResolvedValue({ success: true, data: {} });
    await updateBundle('b1', { name: 'Renamed', description: 'notes' });
    expect(mockedApi.patch).toHaveBeenCalledWith('/bundles/b1', { name: 'Renamed', description: 'notes' });

    await listUploads('b1');
    expect(mockedApi.get).toHaveBeenCalledWith('/bundles/b1/uploads');

    await previewImport('b1', 'zip-1');
    expect(mockedApi.post).toHaveBeenCalledWith('/bundles/b1/import/preview', { zipFileId: 'zip-1' });

    await startImport('b1', 'zip-1');
    expect(mockedApi.post).toHaveBeenCalledWith('/bundles/b1/import', { zipFileId: 'zip-1' });

    const mapping = { frames: 'img', annotations: [{ path: 'seg', set: 'sam' }] };
    await startImport('b1', 'zip-1', mapping);
    expect(mockedApi.post).toHaveBeenCalledWith('/bundles/b1/import', { zipFileId: 'zip-1', mapping });

    await getImport('b1', 'i1');
    expect(mockedApi.get).toHaveBeenCalledWith('/bundles/b1/import/i1');
  });
});

describe('uploadZip', () => {
  interface FakeXhr {
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    status: number;
    responseText: string;
    upload: { onprogress: ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
  }

  const makeXhr = (): FakeXhr => ({
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    status: 200,
    responseText: '',
    upload: { onprogress: null },
    onload: null,
    onerror: null,
    onabort: null,
  });

  const stubXhr = (xhr: FakeXhr) => {
    vi.stubGlobal(
      'XMLHttpRequest',
      function XMLHttpRequestStub(this: unknown) {
        return xhr;
      } as unknown as typeof XMLHttpRequest
    );
  };

  /** Collects every request the uploader opens, so chunks can be answered in turn. */
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

  type Reply = { status?: number; size?: number; body?: string } | 'network' | 'abort';

  /** Wait for request #index to be opened, then answer it. */
  const answer = async (created: FakeXhr[], index: number, reply: Reply): Promise<FakeXhr> => {
    for (let tick = 0; created.length <= index && tick < 100; tick += 1) {
      await Promise.resolve();
    }
    if (created.length <= index) {
      throw new Error(`request ${index} was never opened`);
    }
    const xhr = created[index];
    if (reply === 'network') {
      xhr.onerror!();
      return xhr;
    }
    if (reply === 'abort') {
      xhr.onabort!();
      return xhr;
    }
    xhr.status = reply.status ?? 200;
    xhr.responseText = reply.body ?? (reply.size === undefined ? '' : JSON.stringify({ size: reply.size }));
    xhr.onload!();
    return xhr;
  };

  const CHUNK = 64 * 1024 * 1024;

  /**
   * A File-shaped stand-in: chunking is driven entirely by `size` and `slice`,
   * so tests can describe a multi-hundred-megabyte zip without allocating one.
   */
  const fakeZip = (size: number) => {
    const slices: Array<{ start: number; end: number }> = [];
    const file = {
      name: 'big.zip',
      size,
      slice: (start: number, end: number) => {
        slices.push({ start, end });
        return new Blob(['chunk']);
      },
    } as unknown as File;
    return { file, slices };
  };

  it('PUTs a small file in one request, reports progress, and resolves on 2xx', async () => {
    const xhr = makeXhr();
    stubXhr(xhr);
    const onProgress = vi.fn();
    const file = new File(['0123456789'], 'bundle.zip');

    const promise = uploadZip('http://signed/put', file, onProgress);
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    xhr.onload!();
    await promise;

    expect(xhr.open).toHaveBeenCalledWith('PUT', 'http://signed/put');
    expect(xhr.send).toHaveBeenCalledWith(file);
    expect(xhr.setRequestHeader).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    vi.unstubAllGlobals();
  });

  it('rejects on HTTP error, network error, and abort', async () => {
    const failing = makeXhr();
    failing.status = 500;
    stubXhr(failing);
    const failedPromise = uploadZip('u', new File([''], 'z'), vi.fn());
    failing.onload!();
    await expect(failedPromise).rejects.toThrow('Zip upload failed (500)');

    const network = makeXhr();
    stubXhr(network);
    const networkPromise = uploadZip('u', new File([''], 'z'), vi.fn());
    network.onerror!();
    await expect(networkPromise).rejects.toThrow('network');

    const aborted = makeXhr();
    stubXhr(aborted);
    const abortedPromise = uploadZip('u', new File([''], 'z'), vi.fn());
    aborted.onabort!();
    await expect(abortedPromise).rejects.toThrow('cancelled');

    vi.unstubAllGlobals();
  });

  it('splits a large zip into ranged chunks under the Cloudflare body cap', async () => {
    const created = stubXhrQueue();
    const total = CHUNK * 2 + 10;
    const { file, slices } = fakeZip(total);
    const onProgress = vi.fn();

    const promise = uploadZip('http://signed/put', file, onProgress);
    const first = await answer(created, 0, { size: CHUNK });
    const second = await answer(created, 1, { size: CHUNK * 2 });
    const third = await answer(created, 2, { size: total });
    await promise;

    expect(created).toHaveLength(3);
    expect(first.setRequestHeader).toHaveBeenCalledWith('Content-Range', `bytes 0-${CHUNK - 1}/${total}`);
    expect(second.setRequestHeader).toHaveBeenCalledWith(
      'Content-Range',
      `bytes ${CHUNK}-${CHUNK * 2 - 1}/${total}`
    );
    expect(third.setRequestHeader).toHaveBeenCalledWith('Content-Range', `bytes ${CHUNK * 2}-${total - 1}/${total}`);
    expect(slices).toEqual([
      { start: 0, end: CHUNK },
      { start: CHUNK, end: CHUNK * 2 },
      { start: CHUNK * 2, end: total },
    ]);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    vi.unstubAllGlobals();
  });

  it('reports progress across the whole file, not per chunk', async () => {
    const created = stubXhrQueue();
    const total = CHUNK * 2;
    const { file } = fakeZip(total);
    const onProgress = vi.fn();

    const promise = uploadZip('u', file, onProgress);
    await answer(created, 0, { size: CHUNK });
    for (let tick = 0; created.length < 2 && tick < 100; tick += 1) {
      await Promise.resolve();
    }
    // Half of the second chunk is three quarters of the file.
    created[1].upload.onprogress!({ lengthComputable: true, loaded: CHUNK / 2, total: CHUNK } as ProgressEvent);
    await answer(created, 1, { size: total });
    await promise;

    expect(onProgress).toHaveBeenCalledWith(0.75);
    vi.unstubAllGlobals();
  });

  it('continues from the requested end when a reply carries no stored size', async () => {
    const created = stubXhrQueue();
    const total = CHUNK + 10;
    const { file } = fakeZip(total);

    const promise = uploadZip('u', file, vi.fn());
    await answer(created, 0, { body: '{"success":true}' });
    const second = await answer(created, 1, { size: total });
    await promise;

    expect(second.setRequestHeader).toHaveBeenCalledWith('Content-Range', `bytes ${CHUNK}-${total - 1}/${total}`);
    vi.unstubAllGlobals();
  });

  it('resumes from the offset the server reports on 409', async () => {
    const created = stubXhrQueue();
    const total = CHUNK * 2 + 10;
    const { file } = fakeZip(total);

    const promise = uploadZip('u', file, vi.fn());
    await answer(created, 0, { size: CHUNK });
    // Server actually holds less than we assumed — a chunk died partway through.
    await answer(created, 1, { status: 409, size: CHUNK + 100 });
    const resumed = await answer(created, 2, { size: total });
    await promise;

    expect(resumed.setRequestHeader).toHaveBeenCalledWith(
      'Content-Range',
      `bytes ${CHUNK + 100}-${total - 1}/${total}`
    );
    vi.unstubAllGlobals();
  });

  it('retries the same chunk after a network drop', async () => {
    const created = stubXhrQueue();
    const total = CHUNK + 10;
    const { file } = fakeZip(total);

    const promise = uploadZip('u', file, vi.fn());
    await answer(created, 0, 'network');
    const retry = await answer(created, 1, { size: CHUNK });
    await answer(created, 2, { size: total });
    await promise;

    expect(retry.setRequestHeader).toHaveBeenCalledWith('Content-Range', `bytes 0-${CHUNK - 1}/${total}`);
    vi.unstubAllGlobals();
  });

  it('retries a 5xx chunk but gives up on a 4xx', async () => {
    const created = stubXhrQueue();
    const total = CHUNK + 10;
    const { file } = fakeZip(total);

    const promise = uploadZip('u', file, vi.fn());
    await answer(created, 0, { status: 503 });
    await answer(created, 1, { size: CHUNK });
    await answer(created, 2, { size: total });
    await promise;

    const rejecting = stubXhrQueue();
    const failed = uploadZip('u', fakeZip(total).file, vi.fn());
    const settled = failed.catch((err: Error) => err);
    await answer(rejecting, 0, { status: 400 });

    expect(await settled).toEqual(new Error('Zip upload failed (400)'));
    expect(rejecting).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('gives up after repeated failures on one chunk', async () => {
    const created = stubXhrQueue();
    const { file } = fakeZip(CHUNK + 10);

    const promise = uploadZip('u', file, vi.fn());
    const settled = promise.catch((err: Error) => err);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await answer(created, attempt, 'network');
    }

    expect(await settled).toEqual(new Error('Zip upload failed (network)'));
    expect(created).toHaveLength(4);
    vi.unstubAllGlobals();
  });

  it('gives up when the server keeps disagreeing about the stored size', async () => {
    const created = stubXhrQueue();
    const total = CHUNK * 2;
    const { file } = fakeZip(total);

    const promise = uploadZip('u', file, vi.fn());
    const settled = promise.catch((err: Error) => err);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await answer(created, attempt, { status: 409, size: 1 });
    }

    expect(await settled).toEqual(new Error('Zip upload failed (could not resynchronise with the server)'));
    vi.unstubAllGlobals();
  });
});
