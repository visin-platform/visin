jest.mock('../../services/uploadReservationService', () => ({
  ...jest.requireActual('../../services/uploadReservationService'),
  reserveUpload: jest.fn(async () => ({ allocationId: 'reserved-id' })),
  claimUpload: jest.fn(async (_fileId: string, _kind: string, _parent: string, _resource: string, _user: string, resourceId?: string) => {
    const files = jest.requireMock('../../services/fileServiceClient');
    const metadata = files.getFileMetadata ? await files.getFileMetadata(_fileId) : undefined;
    return { resourceId: resourceId || 'reserved-id', size: metadata?.size ?? 10 };
  }),
  deleteReservedFile: jest.fn(async (fileId: string) => jest.requireMock('../../services/fileServiceClient').deleteFile(fileId))
}));
// These workflow tests stub the write-policy boundary. HTTP/Mongo integration
// tests exercise the real owner/group policy, parent resolution, and denial effects.
jest.mock('../../services/writeAccessService', () => ({
  ...jest.requireActual('../../services/writeAccessService'),
  assertResourceWrite: jest.fn(async (resource: unknown) => {
    if (!resource) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
  }),
  assertLibraryWrite: jest.fn(),
  assertDatasetWrite: jest.fn(),
  assertEpochWrite: jest.fn(async (uuid: string) => {
    const epoch = await jest.requireMock('../../models/Epoch').default.findOne({ epoch_uuid: uuid });
    if (!epoch) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
    return epoch;
  })
}));
jest.mock('../../models/DatasetImage', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Dataset', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../models/ImageCategory', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));
jest.mock('../../services/fileServiceClient', () => ({
  getPhotoSignedUrlsBatch: jest.fn(),
  getPhotoSignedUrl: jest.fn(),
  deleteFile: jest.fn(),
  generateFileId: jest.fn(),
  getUploadSignedUrl: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  getImages,
  createDatasetImage,
  getImagesByCategory,
  getAllImageStats,
  getLabelingStats,
  getSimpleLabelingStats,
  exportImagesByLabels,
  getImageById,
  updateImage,
  deleteImage,
  getUploadSignedUrlRequest,
  exportImageNames,
} from '../../services/datasetImageService';
import DatasetImage from '../../models/DatasetImage';
import Dataset from '../../models/Dataset';
import ImageCategory from '../../models/ImageCategory';
import * as fileService from '../../services/fileServiceClient';

const mockedImage = DatasetImage as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedDataset = Dataset as unknown as Record<string, jest.Mock>;
const mockedCategory = ImageCategory as unknown as Record<string, jest.Mock>;
const mockedFileService = fileService as unknown as Record<string, jest.Mock>;

// Escape hatch for asserting on dynamically-shaped service results in tests;
// modeling every ad-hoc return shape as an interface here would add noise, not safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

const imageDoc = (fileId: string, overrides: AnyDoc = {}): AnyDoc => ({
  _id: `img-${fileId}`,
  fileId: fileId,
  thumbnailFileId: undefined,
  datasetId: 'd1',
  toObject() {
    return { _id: this._id, fileId: this.fileId };
  },
  save: jest.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
  ...overrides,
});

const signedUrl = (url: string) => ({
  signedUrl: url,
  expiresAt: 'later',
  expiresInMinutes: 60,
});

const mockFindChain = (docs: unknown[]) => {
  const chain: AnyDoc = {};
  Object.assign(chain, {
    sort: jest.fn().mockReturnValue(chain),
    limit: jest.fn().mockReturnValue(chain),
    skip: jest.fn().mockReturnValue(chain),
    populate: jest.fn().mockReturnValue(chain),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(docs).then(resolve, reject),
  });
  mockedImage.find.mockReturnValue(chain);
  return chain;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedFileService.getPhotoSignedUrlsBatch.mockResolvedValue({});
});

describe('getImages', () => {
  it('applies filters and enriches with signed URLs (thumbnail falls back to original)', async () => {
    const doc = imageDoc('f1');
    const chain = mockFindChain([doc]);
    mockedImage.countDocuments.mockResolvedValue(1);
    mockedFileService.getPhotoSignedUrlsBatch.mockResolvedValue({ f1: signedUrl('http://s/f1') });

    const result = await getImages({
      datasetId: 'd1',
      search: 'cat',
      categoryId: 'c1',
      tags: ['good'],
      condition: 'snow',
      sortBy: 'createdAt',
      sortOrder: 'asc',
      page: 2,
      limit: 10,
    });

    expect(mockedImage.find).toHaveBeenCalledWith({
      datasetId: 'd1',
      $text: { $search: 'cat' },
      categoryId: 'c1',
      tags: { $in: ['good'] },
      condition: 'snow',
    });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(result.images[0].signedUrl).toBe('http://s/f1');
    expect(result.images[0].thumbnailSignedUrl).toBe('http://s/f1');
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, pages: 1 });
  });

  it('uses a $sample pipeline for random selection', async () => {
    mockedImage.aggregate.mockResolvedValue([{ _id: 'i1', fileId: 'f1' }]);
    mockedImage.countDocuments.mockResolvedValue(5);

    const result = await getImages({ random: true, limit: 3 });

    expect(mockedImage.aggregate).toHaveBeenCalledWith([
      { $match: {} },
      { $sample: { size: 3 } },
    ]);
    expect(result.images).toHaveLength(1);
  });

  it('returns an empty page when nothing matches', async () => {
    mockFindChain([]);
    mockedImage.countDocuments.mockResolvedValue(0);

    const result = await getImages({});

    expect(result.images).toEqual([]);
    expect(result.pagination.pages).toBe(0);
  });

  it('uses dedicated thumbnail URLs when present and survives batch URL failures', async () => {
    const doc = imageDoc('f1', { thumbnailFileId: 'thumb-f1' });
    mockFindChain([doc]);
    mockedImage.countDocuments.mockResolvedValue(1);
    mockedFileService.getPhotoSignedUrlsBatch
      .mockRejectedValueOnce(new Error('batch down'))
      .mockResolvedValueOnce({ f1: signedUrl('http://s/thumb') });

    const result = await getImages({ sortBy: 'bogus-field' });

    expect(result.images[0].signedUrl).toBeUndefined();
    expect(result.images[0].thumbnailSignedUrl).toBe('http://s/thumb');
  });
});

describe('createDatasetImage', () => {
  const data = {
    filename: 'f.jpg',
    originalName: 'o.jpg',
    fileId: 'm1',
    datasetId: 'd1',
    categoryId: 'c1',
    mimetype: 'image/jpeg',
    size: 10,
  };

  it('rejects an unknown category', async () => {
    mockedCategory.findById.mockResolvedValue(null);

    await expect(createDatasetImage(data)).rejects.toThrow('Invalid categoryId');
  });

  it('409s when the fileId already exists', async () => {
    mockedCategory.findById.mockResolvedValue({ _id: 'c1', datasetId: 'd1' });
    mockedImage.findOne.mockResolvedValue(imageDoc('m1'));

    await expect(createDatasetImage(data)).rejects.toThrow('already exists');
  });

  it('trims tags/labels and saves', async () => {
    mockedCategory.findById.mockResolvedValue({ _id: 'c1', datasetId: 'd1' });
    mockedImage.findOne.mockResolvedValue(null);
    mockedImage.mockImplementation((d: AnyDoc) => ({
      ...d,
      save: jest.fn().mockResolvedValue({ ...d, _id: 'new' }),
    }));

    const result = (await createDatasetImage({
      ...data,
      title: ' T ',
      tags: [' good ', ''],
      labels: [' bad_annotations ', '  '],
    })) as AnyDoc;

    const ctorArg = mockedImage.mock.calls[0][0];
    expect(ctorArg.title).toBe('T');
    expect(ctorArg.tags).toEqual(['good']);
    expect(ctorArg.labels).toEqual(['bad_annotations']);
    expect(result._id).toBe('new');
  });
});

describe('getImagesByCategory', () => {
  it('404s for an unknown dataset', async () => {
    mockedDataset.findOne.mockResolvedValue(null);

    await expect(getImagesByCategory('ghost', 'c1', {})).rejects.toThrow("Dataset 'ghost' not found");
  });

  it('resolves the dataset by uuid/name/id and filters by labels', async () => {
    mockedDataset.findOne.mockResolvedValue({ _id: 'ds-1' });
    const chain = mockFindChain([imageDoc('f1')]);
    mockedImage.countDocuments.mockResolvedValue(1);

    const result = await getImagesByCategory(VALID_OBJECT_ID, 'c1', {
      search: 'x',
      labels: 'good, bad',
      page: 1,
      limit: 10,
    });

    expect(mockedImage.find).toHaveBeenCalledWith({
      datasetId: 'ds-1',
      categoryId: 'c1',
      $text: { $search: 'x' },
      labels: { $in: ['good', 'bad'] },
    });
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(result.pagination.total).toBe(1);
  });

  it('returns empty pagination when the category has no images', async () => {
    mockedDataset.findOne.mockResolvedValue({ _id: 'ds-1' });
    mockFindChain([]);
    mockedImage.countDocuments.mockResolvedValue(0);

    const result = await getImagesByCategory('ds', 'c1', {});

    expect(result.images).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, limit: 0, total: 0, pages: 0 });
  });
});

describe('stats', () => {
  it('getAllImageStats aggregates overview, datasets, tags, categories, and file types', async () => {
    mockedImage.countDocuments.mockResolvedValue(10);
    mockedImage.aggregate
      .mockResolvedValueOnce([{ _id: null, total: 1000 }]) // total size
      .mockResolvedValueOnce([{ _id: 'd1', count: 10 }]) // dataset stats
      .mockResolvedValueOnce([{ _id: 'good', count: 5 }]) // tags
      .mockResolvedValueOnce([{ count: 10, name: 'Cat' }]) // categories
      .mockResolvedValueOnce([{ _id: 'image/jpeg', count: 10 }]); // file types

    const stats = await getAllImageStats();

    expect(stats.overview).toEqual({ totalImages: 10, totalSize: 1000, averageSize: 100 });
    expect(stats.tags[0]._id).toBe('good');
  });

  it('getAllImageStats handles an empty collection', async () => {
    mockedImage.countDocuments.mockResolvedValue(0);
    mockedImage.aggregate.mockResolvedValue([]);

    const stats = await getAllImageStats();

    expect(stats.overview).toEqual({ totalImages: 0, totalSize: 0, averageSize: 0 });
  });

  it('getLabelingStats computes percentages, scoped to a dataset when given', async () => {
    mockedImage.aggregate.mockResolvedValue([{ total: 4, good: 2, bad: 1, unlabeled: 1 }]);

    const stats = await getLabelingStats('d1');

    expect(mockedImage.aggregate.mock.calls[0][0][0]).toEqual({ $match: { datasetId: 'd1' } });
    expect(stats.goodPercentage).toBe(50);
    expect(stats.badPercentage).toBe(25);
    expect(stats.unlabeledPercentage).toBe(25);
  });

  it('getLabelingStats zeroes out when there are no images', async () => {
    mockedImage.aggregate.mockResolvedValue([]);

    const stats = await getLabelingStats();

    expect(stats).toEqual(
      expect.objectContaining({ total: 0, good: 0, bad: 0, unlabeled: 0, goodPercentage: 0 })
    );
  });

  it('getSimpleLabelingStats runs three counts in parallel', async () => {
    mockedImage.countDocuments
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2);

    await expect(getSimpleLabelingStats('d1')).resolves.toEqual({ total: 10, good: 6, bad: 2 });
  });
});

describe('exportImagesByLabels / exportImageNames', () => {
  it('404s for an unknown dataset', async () => {
    mockedDataset.findOne.mockResolvedValue(null);

    await expect(exportImagesByLabels('ghost', 'good')).rejects.toThrow('not found');
  });

  it('exports images matching the labels', async () => {
    mockedDataset.findOne.mockResolvedValue({ _id: 'ds-1' });
    const docs = [imageDoc('f1')];
    mockFindChain(docs);

    const result = await exportImagesByLabels('ds', 'good, bad');

    expect(mockedImage.find).toHaveBeenCalledWith({
      datasetId: 'ds-1',
      labels: { $in: ['good', 'bad'] },
    });
    expect(result.labelsArray).toEqual(['good', 'bad']);
    expect(result.images).toEqual(docs);
  });

  it('exportImageNames maps tag filters to regexes', async () => {
    mockFindChain([]);
    await exportImageNames('d1', 'good');
    expect(mockedImage.find).toHaveBeenCalledWith({ datasetId: 'd1', tags: { $regex: /good/i } });

    await exportImageNames('d1', 'bad');
    expect(mockedImage.find).toHaveBeenLastCalledWith({ datasetId: 'd1', tags: { $regex: /bad/i } });

    await exportImageNames('d1', 'all');
    expect(mockedImage.find).toHaveBeenLastCalledWith({ datasetId: 'd1' });

    await exportImageNames('d1');
    expect(mockedImage.find).toHaveBeenLastCalledWith({ datasetId: 'd1' });
  });
});

describe('getImageById', () => {
  it('404s when missing', async () => {
    const populate = jest.fn().mockResolvedValue(null);
    mockedImage.findById.mockReturnValue({ populate });

    await expect(getImageById('x')).rejects.toThrow('Dataset image not found');
  });

  it('attaches signed URLs including thumbnails', async () => {
    const doc = imageDoc('f1', { thumbnailFileId: 'thumb' });
    const populate = jest.fn().mockResolvedValue(doc);
    mockedImage.findById.mockReturnValue({ populate });
    mockedFileService.getPhotoSignedUrl
      .mockResolvedValueOnce(signedUrl('http://s/orig'))
      .mockResolvedValueOnce(signedUrl('http://s/thumb'));

    const result = (await getImageById('x')) as AnyDoc;

    expect(result.signedUrl).toBe('http://s/orig');
    expect(result.thumbnailSignedUrl).toBe('http://s/thumb');
  });

  it('falls back to the bare document when URL signing fails', async () => {
    const doc = imageDoc('f1');
    const populate = jest.fn().mockResolvedValue(doc);
    mockedImage.findById.mockReturnValue({ populate });
    mockedFileService.getPhotoSignedUrl.mockRejectedValue(new Error('file-service down'));

    const result = (await getImageById('x')) as AnyDoc;

    expect(result.signedUrl).toBeUndefined();
    expect(result._id).toBe('img-f1');
  });

  it('keeps the original URL when only the thumbnail signing fails', async () => {
    const doc = imageDoc('f1', { thumbnailFileId: 'thumb' });
    const populate = jest.fn().mockResolvedValue(doc);
    mockedImage.findById.mockReturnValue({ populate });
    mockedFileService.getPhotoSignedUrl
      .mockResolvedValueOnce(signedUrl('http://s/orig'))
      .mockRejectedValueOnce(new Error('thumb fail'));

    const result = (await getImageById('x')) as AnyDoc;

    expect(result.signedUrl).toBe('http://s/orig');
    expect(result.thumbnailSignedUrl).toBeUndefined();
  });
});

describe('updateImage', () => {
  it('404s when missing', async () => {
    mockedImage.findById.mockResolvedValue(null);
    mockedImage.findByIdAndUpdate.mockResolvedValue(null);

    await expect(updateImage('x', {})).rejects.toThrow('Dataset image not found');
  });

  it('builds a partial update with trimming and category clearing', async () => {
    const updated = imageDoc('f1');
    mockedImage.findById.mockResolvedValue(updated);
    mockedImage.findByIdAndUpdate.mockResolvedValue(updated);

    await updateImage('x', {
      title: ' T ',
      tags: [' a ', ''],
      labels: [' l ', ' '],
      categoryId: null,
      condition: 'snow',
      metadata: { k: 1 },
    });

    expect(mockedImage.findByIdAndUpdate).toHaveBeenCalledWith(
      'x',
      {
        title: 'T',
        tags: ['a'],
        labels: ['l'],
        categoryId: null,
        condition: 'snow',
        metadata: { k: 1 },
      },
      { new: true }
    );
  });
});

describe('deleteImage', () => {
  it('404s when missing', async () => {
    mockedImage.findById.mockResolvedValue(null);

    await expect(deleteImage('x')).rejects.toThrow('Dataset image not found');
  });

  it('deletes the verified original but retains an unverified thumbnail', async () => {
    mockedImage.findById.mockResolvedValue(imageDoc('f1', { thumbnailFileId: 'thumb' }));
    mockedFileService.deleteFile.mockResolvedValue(undefined);
    mockedImage.findByIdAndDelete.mockResolvedValue({});

    const result = await deleteImage('x');

    expect(mockedFileService.deleteFile).toHaveBeenCalledWith('f1');
    expect(mockedFileService.deleteFile).not.toHaveBeenCalledWith('thumb');
    expect(mockedImage.findByIdAndDelete).toHaveBeenCalledWith('x');
    expect(result).toEqual({ datasetId: 'd1', fileId: 'f1', hadThumbnail: true });
  });

  it('retains the record for retry when storage deletion fails', async () => {
    mockedImage.findById.mockResolvedValue(imageDoc('f1'));
    mockedFileService.deleteFile.mockRejectedValue(new Error('file-service down'));
    mockedImage.findByIdAndDelete.mockResolvedValue({});

    await expect(deleteImage('x')).rejects.toThrow('file-service down');
    expect(mockedImage.findByIdAndDelete).not.toHaveBeenCalled();
  });
});

describe('getUploadSignedUrlRequest', () => {
  it('rejects an unknown category when one is given', async () => {
    mockedCategory.findById.mockResolvedValue(null);

    await expect(
      getUploadSignedUrlRequest({
        filename: 'f.jpg',
        mimetype: 'image/jpeg',
        datasetId: 'd1',
        categoryId: 'ghost',
        userId: 'u1',
      })
    ).rejects.toThrow('Invalid categoryId');
  });

  it('generates a file id and a signed upload URL', async () => {
    mockedFileService.generateFileId.mockReturnValue('vision/u1/d1/f.jpg');
    mockedFileService.getUploadSignedUrl.mockResolvedValue('http://upload');

    const result = await getUploadSignedUrlRequest({
      filename: 'f.jpg',
      mimetype: 'image/jpeg',
      datasetId: 'd1',
      userId: 'u1',
    });

    expect(mockedFileService.generateFileId).toHaveBeenCalledWith('u1', 'd1', 'f.jpg', 'vision');
    expect(mockedFileService.getUploadSignedUrl).toHaveBeenCalledWith('vision/u1/d1/f.jpg', 'image/jpeg', 15);
    expect(result).toEqual({
      uploadUrl: 'http://upload',
      fileId: 'vision/u1/d1/f.jpg',
      datasetId: 'd1',
      categoryId: undefined,
      expiresInMinutes: 15,
    });
  });
});
