jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  generateFileId,
  generateThumbnailFileId,
  generateThumbnailFileIdFromFileId,
  getFileFolder,
  uploadFile,
  getPhotoSignedUrl,
  getSignedUrl,
  getPhotoSignedUrlsBatch,
  getUploadSignedUrl,
  deleteFile,
  deleteFolder,
  fileExists,
  getFileMetadata,
  listFiles,
  copyFile,
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

describe('file id helpers', () => {
  it('generateFileId builds groupId/albumId/fileId/original.ext', () => {
    const id = generateFileId('u1', 'album', 'photo.JPG', 'grp');
    expect(id).toMatch(/^grp\/album\/\d+-[a-z0-9]+\/original\.JPG$/);
  });

  it('falls back to userId then anonymous for the top level', () => {
    expect(generateFileId('u1', 'a', 'f.png')).toMatch(/^u1\//);
    expect(generateFileId(undefined, 'a', 'f.png')).toMatch(/^anonymous\//);
  });

  it('generateThumbnailFileId always ends in thumbnail.jpg', () => {
    expect(generateThumbnailFileId('u1', 'a', 'f.png', 'grp')).toMatch(
      /^grp\/a\/\d+-[a-z0-9]+\/thumbnail\.jpg$/
    );
  });

  it('generateThumbnailFileIdFromFileId swaps the filename', () => {
    expect(generateThumbnailFileIdFromFileId('g/a/123/original.png')).toBe('g/a/123/thumbnail.jpg');
    expect(generateThumbnailFileIdFromFileId('a/123/original.png')).toBe('a/123/thumbnail.jpg');
  });

  it('getFileFolder returns the containing folder', () => {
    expect(getFileFolder('g/a/123/original.png')).toBe('g/a/123/');
    expect(getFileFolder('short/path')).toBe('short/path');
  });
});

describe('uploadFile', () => {
  it('PUTs the buffer with the internal API key', async () => {
    mockFetch.mockResolvedValue(okJson({ fileId: 'g/a/1/original.png' }));

    const result = await uploadFile(Buffer.from('x'), 'g/a/1/original.png', 'image/png', 1);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://files:5002/internal/files/g/a/1/original.png',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'X-Internal-Api-Key': 'key', 'Content-Type': 'image/png' }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({ fileId: 'g/a/1/original.png', bucket: 'vision', size: 1 })
    );
  });

  it('wraps upload failures', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(uploadFile(Buffer.from('x'), 'f', 'image/png', 1)).rejects.toThrow(
      'File upload failed'
    );
  });
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

  it('getPhotoSignedUrl picks the right file id and skips missing ones', async () => {
    mockFetch.mockResolvedValue(
      okJson({ success: true, data: { downloadUrl: 'http://dl', expiresMs: 1 } })
    );

    await getPhotoSignedUrl({ minioFileId: 'orig', minioThumbnailFileId: 'thumb' }, true);
    expect(mockFetch.mock.calls[0][1].body).toContain('thumb');

    await expect(getPhotoSignedUrl({ minioFileId: 'orig' }, true)).resolves.toBeNull();
    await expect(getPhotoSignedUrl({}, false)).resolves.toBeNull();
  });
});

describe('getPhotoSignedUrlsBatch', () => {
  it('maps successful URLs by minioFileId and skips failures', async () => {
    mockFetch
      .mockResolvedValueOnce(okJson({ success: true, data: { downloadUrl: 'http://1', expiresMs: 1 } }))
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await getPhotoSignedUrlsBatch([
      { minioFileId: 'f1' },
      { minioFileId: 'f2' },
      {}, // no id at all — skipped without a fetch
    ]);

    expect(Object.keys(result)).toEqual(['f1']);
    expect(result.f1.signedUrl).toBe('http://1');
  });

  it('processes more than one concurrency window', async () => {
    mockFetch.mockResolvedValue(
      okJson({ success: true, data: { downloadUrl: 'http://n', expiresMs: 1 } })
    );
    const photos = Array.from({ length: 12 }, (_, i) => ({ minioFileId: `f${i}` }));

    const result = await getPhotoSignedUrlsBatch(photos);

    expect(Object.keys(result)).toHaveLength(12);
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

  it('deleteFolder posts the prefix and reports success/failure', async () => {
    mockFetch.mockResolvedValue(okJson({ count: 3 }));
    await expect(deleteFolder('g/a/')).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://files:5002/internal/files/folder',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ prefix: 'g/a/' }) })
    );

    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(deleteFolder('g/a/')).resolves.toBe(false);
  });
});

describe('fileExists / getFileMetadata / listFiles / copyFile', () => {
  it('fileExists mirrors response.ok and absorbs errors', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await expect(fileExists('f1')).resolves.toBe(true);

    mockFetch.mockResolvedValue({ ok: false });
    await expect(fileExists('f1')).resolves.toBe(false);

    mockFetch.mockRejectedValue(new Error('down'));
    await expect(fileExists('f1')).resolves.toBe(false);
  });

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

  it('listFiles passes prefix/maxKeys and defaults to []', async () => {
    mockFetch.mockResolvedValue(okJson({ data: [{ name: 'a' }] }));
    await expect(listFiles('pre', 10)).resolves.toEqual([{ name: 'a' }]);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://files:5002/internal/files?prefix=pre&maxKeys=10',
      expect.any(Object)
    );

    mockFetch.mockResolvedValue(okJson({}));
    await expect(listFiles()).resolves.toEqual([]);

    mockFetch.mockResolvedValue({ ok: false });
    await expect(listFiles()).rejects.toThrow('Failed to list files');
  });

  it('copyFile is a logged no-op', async () => {
    await expect(copyFile('a', 'b')).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
