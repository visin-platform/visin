jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  getSignedUrl,
  getUploadSignedUrl,
  deleteFile,
  getFileMetadata,
} from '../../services/fileServiceClient';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const okJson = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FILE_SERVICE_URL = 'http://files:5002/';
  process.env.FILE_SERVICE_API_KEY = 'key';
});

afterAll(() => {
  delete process.env.FILE_SERVICE_URL;
  delete process.env.FILE_SERVICE_API_KEY;
});

describe('getSignedUrl / getPhotoSignedUrl', () => {
  it('returns signed URL data on success', async () => {
    mockFetch.mockResolvedValue(
      okJson({ success: true, data: { downloadUrl: 'http://dl', expiresMs: 1735689600000 } })
    );

    const result = await getSignedUrl('f1', 30);

    expect(result).toEqual({
      signedUrl: 'http://dl',
      expiresAt: new Date(1735689600000).toISOString(),
      expiresInMinutes: 30,
    });
  });

  it('returns null instead of throwing on failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(getSignedUrl('f1')).resolves.toBeNull();

    mockFetch.mockResolvedValue(okJson({ success: false }));
    await expect(getSignedUrl('f1')).resolves.toBeNull();

    mockFetch.mockRejectedValue(new Error('down'));
    await expect(getSignedUrl('f1')).resolves.toBeNull();
  });

});

describe('getUploadSignedUrl', () => {
  it('returns the upload URL', async () => {
    mockFetch.mockResolvedValue(okJson({ success: true, data: { uploadUrl: 'http://up' } }));

    await expect(getUploadSignedUrl('f1', 'image/png')).resolves.toBe('http://up');
  });

  it('throws on non-ok or malformed responses', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(getUploadSignedUrl('f1', 'image/png')).rejects.toThrow(
      'Failed to generate upload URL'
    );

    mockFetch.mockResolvedValue(okJson({ success: true }));
    await expect(getUploadSignedUrl('f1', 'image/png')).rejects.toThrow(
      'Failed to generate upload URL'
    );
  });
});

describe('deleteFile / deleteFolder', () => {
  it('deleteFile treats 404 as success', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(deleteFile('f1')).resolves.toBe(true);

    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await expect(deleteFile('f1')).resolves.toBe(true);
  });

  it('deleteFile returns false on real failures', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(deleteFile('f1')).resolves.toBe(false);

    mockFetch.mockRejectedValue(new Error('down'));
    await expect(deleteFile('f1')).resolves.toBe(false);
  });

});

describe('fileExists / getFileMetadata / listFiles / copyFile', () => {
  it('getFileMetadata shapes the metadata response', async () => {
    mockFetch.mockResolvedValue(okJson({ data: { size: 5, lastModified: 'yesterday' } }));

    await expect(getFileMetadata('f1')).resolves.toEqual({
      size: 5,
      lastModified: 'yesterday',
      etag: 'f1',
      contentType: 'application/octet-stream',
      metadata: {},
    });
  });

  it('getFileMetadata throws File not found on failure', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    await expect(getFileMetadata('f1')).rejects.toThrow('File not found');
  });

});

describe('file-service address', () => {
  it('prefers the internal address, when one is set, over the public one', async () => {
    process.env.FILE_SERVICE_INTERNAL_URL = 'http://file-service:5002/';
    try {
      mockFetch.mockResolvedValue(okJson({ success: true, data: { downloadUrl: 'http://dl', expiresMs: 1 } }));
      await getSignedUrl('f1');
      expect(mockFetch.mock.calls[0][0]).toBe('http://file-service:5002/internal/download-url');
    } finally {
      delete process.env.FILE_SERVICE_INTERNAL_URL;
    }
  });
});
