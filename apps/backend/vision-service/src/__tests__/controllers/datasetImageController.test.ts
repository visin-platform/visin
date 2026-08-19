import type { Request, Response } from 'express';
import { getAllImages, getUploadUrl } from '../../controllers/datasetImageController';
import { getAllImagesQuerySchema, getUploadUrlBodySchema } from '../../validation/datasetImageSchemas';

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

// The real request pipeline runs `validateRequest` (which applies the
// schema's defaults/coercion) before the controller ever sees req.query —
// these tests call the controller directly, so they parse through the same
// schema to build a query that matches what the controller actually receives.
const makeReq = (rawQuery: Record<string, unknown> = {}): Request =>
  ({ query: getAllImagesQuerySchema.parse(rawQuery) }) as unknown as Request;

const makeUploadUrlReq = (rawBody: Record<string, unknown>): Request =>
  ({ body: getUploadUrlBodySchema.parse(rawBody), user: { id: 'u1' } }) as unknown as Request;

jest.mock('../../services/datasetImageService', () => ({
  getImages: jest.fn().mockResolvedValue({
    images: [],
    total: 0,
    page: 1,
    limit: 50,
  }),
  getUploadSignedUrlRequest: jest.fn().mockResolvedValue({
    uploadUrl: 'http://upload',
    fileId: 'vision/u1/d1/f.jpg',
    datasetId: 'd1',
    categoryId: undefined,
    expiresInMinutes: 15,
  }),
}));

describe('getAllImages', () => {
  it('returns success: true with data from the service', async () => {
    const req = makeReq();
    const res = makeRes();

    await getAllImages(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it('applies default pagination when page and limit are absent', async () => {
    const { getImages } = jest.requireMock('../../services/datasetImageService');
    const req = makeReq();
    const res = makeRes();

    await getAllImages(req, res);

    expect(getImages).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 50 })
    );
  });

  it('parses page and limit from query string', async () => {
    const { getImages } = jest.requireMock('../../services/datasetImageService');
    const req = makeReq({ page: '2', limit: '20' });
    const res = makeRes();

    await getAllImages(req, res);

    expect(getImages).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 20 })
    );
  });

  it('propagates the error when the service throws, for the shared errorHandler to catch', async () => {
    const { getImages } = jest.requireMock('../../services/datasetImageService');
    getImages.mockRejectedValueOnce(new Error('DB error'));

    const req = makeReq();
    const res = makeRes();

    await expect(getAllImages(req, res)).rejects.toThrow('DB error');
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('getUploadUrl', () => {
  it('returns the signed upload URL for the requesting user', async () => {
    const { getUploadSignedUrlRequest } = jest.requireMock('../../services/datasetImageService');
    const res = makeRes();

    await getUploadUrl(
      makeUploadUrlReq({ filename: 'f.jpg', mimetype: 'image/jpeg', datasetId: 'd1', categoryId: 'c1' }),
      res
    );

    expect(getUploadSignedUrlRequest).toHaveBeenCalledWith({
      filename: 'f.jpg',
      mimetype: 'image/jpeg',
      datasetId: 'd1',
      categoryId: 'c1',
      userId: 'u1',
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ uploadUrl: 'http://upload' }) })
    );
  });

  it('rejects a body without the fields the upload needs', () => {
    expect(getUploadUrlBodySchema.safeParse({ filename: 'f.jpg', mimetype: 'image/jpeg' }).success).toBe(false);
    expect(getUploadUrlBodySchema.safeParse({ filename: '', mimetype: 'image/jpeg', datasetId: 'd1' }).success).toBe(
      false
    );
  });
});
