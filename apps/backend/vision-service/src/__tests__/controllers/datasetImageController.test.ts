import type { Request, Response } from 'express';
import { getAllImages } from '../../controllers/datasetImageController';
import { getAllImagesQuerySchema } from '../../validation/datasetImageSchemas';

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

jest.mock('../../services/datasetImageService', () => ({
  getImages: jest.fn().mockResolvedValue({
    images: [],
    total: 0,
    page: 1,
    limit: 50,
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
