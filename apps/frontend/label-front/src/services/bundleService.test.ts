import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./labelApiClient', () => ({
  labelApi: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { labelApi } from './labelApiClient';
import {
  createBundle,
  deleteBundle,
  getBundle,
  getImport,
  getUploadUrl,
  listBundles,
  previewImport,
  startImport,
  uploadZip,
} from './bundleService';

const mockedApi = labelApi as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

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
    status: number;
    upload: { onprogress: ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
  }

  const makeXhr = (): FakeXhr => ({
    open: vi.fn(),
    send: vi.fn(),
    status: 200,
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

  it('PUTs the file, reports progress, and resolves on 2xx', async () => {
    const xhr = makeXhr();
    stubXhr(xhr);
    const onProgress = vi.fn();
    const file = new File(['zip'], 'bundle.zip');

    const promise = uploadZip('http://signed/put', file, onProgress);
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    xhr.onload!();
    await promise;

    expect(xhr.open).toHaveBeenCalledWith('PUT', 'http://signed/put');
    expect(xhr.send).toHaveBeenCalledWith(file);
    expect(onProgress).toHaveBeenCalledWith(0.5);
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
});
