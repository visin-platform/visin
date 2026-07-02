import type { Request, Response } from 'express';
import { getAllImages } from '../../controllers/datasetImageController';

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

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
    const req = { query: {} } as unknown as Request;
    const res = makeRes();

    await getAllImages(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it('applies default pagination when page and limit are absent', async () => {
    const { getImages } = jest.requireMock('../../services/datasetImageService');
    const req = { query: {} } as unknown as Request;
    const res = makeRes();

    await getAllImages(req, res);

    expect(getImages).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 50 })
    );
  });

  it('parses page and limit from query string', async () => {
    const { getImages } = jest.requireMock('../../services/datasetImageService');
    const req = { query: { page: '2', limit: '20' } } as unknown as Request;
    const res = makeRes();

    await getAllImages(req, res);

    expect(getImages).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 20 })
    );
  });

  it('returns 500 when the service throws', async () => {
    const { getImages } = jest.requireMock('../../services/datasetImageService');
    getImages.mockRejectedValueOnce(new Error('DB error'));

    const req = { query: {} } as unknown as Request;
    const res = makeRes();

    await getAllImages(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});
