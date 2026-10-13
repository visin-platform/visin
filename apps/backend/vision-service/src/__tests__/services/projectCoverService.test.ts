jest.mock('../../models/Training', () => ({ __esModule: true, default: { aggregate: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../models/Epoch', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/EpochVisualization', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../clients/fileServiceClient', () => ({ getSignedUrl: jest.fn() }));
jest.mock('../../clients/datasetCoversClient', () => ({ fetchDatasetCovers: jest.fn() }));

import { chooseCover, coverUrlsFor } from '../../services/projectCoverService';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import EpochVisualization from '../../models/EpochVisualization';
import { getSignedUrl } from '../../clients/fileServiceClient';
import { fetchDatasetCovers } from '../../clients/datasetCoversClient';

const mocked = (model: unknown) => model as Record<string, jest.Mock>;
const project = (id: string, cover?: { visualizationUuid: string; fileId: string }) => ({ _id: id, cover }) as never;

const select = (value: unknown) => ({ select: jest.fn().mockResolvedValue(value) });

beforeEach(() => {
  jest.clearAllMocks();
  mocked(Training).aggregate.mockResolvedValue([]);
  jest.mocked(fetchDatasetCovers).mockResolvedValue({});
});

describe('coverUrlsFor', () => {
  it('uses the chosen picture, and asks nothing of datasets for a project that has one', async () => {
    jest.mocked(getSignedUrl).mockResolvedValue({ signedUrl: 'https://f/x.png', expiresAt: 'later', expiresInMinutes: 60 });

    const covers = await coverUrlsFor([project('p1', { visualizationUuid: 'v', fileId: 'files/x.png' })], 'u1');

    expect(covers.get('p1')).toBe('https://f/x.png');
    expect(getSignedUrl).toHaveBeenCalledWith('files/x.png', 60);
    expect(mocked(Training).aggregate).not.toHaveBeenCalled();
    expect(fetchDatasetCovers).not.toHaveBeenCalled();
  });

  it('falls back to the cover of the dataset most of the runs used, as this reader may see it', async () => {
    mocked(Training).aggregate.mockResolvedValue([
      { _id: { projectId: 'p1', datasetId: 'd-big' }, runs: 9 },
      { _id: { projectId: 'p1', datasetId: 'd-small' }, runs: 2 },
      { _id: { projectId: 'p2', datasetId: 'd-private' }, runs: 4 }
    ]);
    jest.mocked(fetchDatasetCovers).mockResolvedValue({ 'd-big': 'https://f/big.jpg', 'd-small': 'https://f/small.jpg' });

    const covers = await coverUrlsFor([project('p1'), project('p2'), project('p3')], 'u1');

    expect(fetchDatasetCovers).toHaveBeenCalledWith(expect.arrayContaining(['d-big', 'd-small', 'd-private']), 'u1');
    expect(covers.get('p1')).toBe('https://f/big.jpg');
    // A dataset the reader may not see has no cover to give: the project shows its plain tile.
    expect(covers.has('p2')).toBe(false);
    expect(covers.has('p3')).toBe(false);
  });

  it('tries the next dataset when the most used one has no cover', async () => {
    mocked(Training).aggregate.mockResolvedValue([
      { _id: { projectId: 'p1', datasetId: 'd-bare' }, runs: 9 },
      { _id: { projectId: 'p1', datasetId: 'd-pretty' }, runs: 2 }
    ]);
    jest.mocked(fetchDatasetCovers).mockResolvedValue({ 'd-pretty': 'https://f/pretty.jpg' });

    expect((await coverUrlsFor([project('p1')], undefined)).get('p1')).toBe('https://f/pretty.jpg');
  });

  it('tries only the few most used datasets of a project', async () => {
    mocked(Training).aggregate.mockResolvedValue(
      ['d1', 'd2', 'd3', 'd4'].map((datasetId, index) => ({ _id: { projectId: 'p1', datasetId }, runs: 9 - index }))
    );

    await coverUrlsFor([project('p1')], 'u1');

    expect(jest.mocked(fetchDatasetCovers).mock.calls[0][0]).toEqual(['d1', 'd2', 'd3']);
  });

  it('falls back when a chosen picture can no longer be signed', async () => {
    jest.mocked(getSignedUrl).mockResolvedValue(null);
    mocked(Training).aggregate.mockResolvedValue([{ _id: { projectId: 'p1', datasetId: 'd1' }, runs: 1 }]);
    jest.mocked(fetchDatasetCovers).mockResolvedValue({ d1: 'https://f/d1.jpg' });

    const covers = await coverUrlsFor([project('p1', { visualizationUuid: 'gone', fileId: 'files/gone.png' })], 'u1');

    expect(covers.get('p1')).toBe('https://f/d1.jpg');
  });
});

describe('chooseCover', () => {
  const found = () => {
    mocked(EpochVisualization).findOne.mockResolvedValue({ visualization_uuid: 'viz-1', epoch_uuid: 'e1', fileId: 'files/viz.png' });
    mocked(Epoch).findOne.mockReturnValue(select({ trainingId: 't1' }));
  };

  it('keeps the visualization and its file when one of the project\'s own runs rendered it', async () => {
    found();
    mocked(Training).findOne.mockReturnValue(select({ projectId: 'p1' }));

    expect(await chooseCover({ _id: 'p1' } as never, 'viz-1')).toEqual({ visualizationUuid: 'viz-1', fileId: 'files/viz.png' });
  });

  it('refuses another project\'s visualization as not found, saying nothing of it', async () => {
    found();
    mocked(Training).findOne.mockReturnValue(select({ projectId: 'someone-elses' }));

    await expect(chooseCover({ _id: 'p1' } as never, 'viz-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses an unknown visualization, and one whose run is gone', async () => {
    mocked(EpochVisualization).findOne.mockResolvedValue(null);
    await expect(chooseCover({ _id: 'p1' } as never, 'nope')).rejects.toMatchObject({ statusCode: 404 });

    found();
    mocked(Training).findOne.mockReturnValue(select(null));
    await expect(chooseCover({ _id: 'p1' } as never, 'viz-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a visualization whose epoch is gone', async () => {
    mocked(EpochVisualization).findOne.mockResolvedValue({ visualization_uuid: 'viz-1', epoch_uuid: 'e-gone', fileId: 'f' });
    mocked(Epoch).findOne.mockReturnValue(select(null));

    await expect(chooseCover({ _id: 'p1' } as never, 'viz-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('clears the cover with null', async () => {
    expect(await chooseCover({ _id: 'p1' } as never, null)).toBeUndefined();
  });
});
