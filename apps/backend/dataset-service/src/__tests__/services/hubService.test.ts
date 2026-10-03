import { clearHubCache, hubSummary, summarize } from '../../services/hubService';
import { fetchDatasetInfo } from '../../clients/hubClient';

jest.mock('../../clients/hubClient', () => ({ fetchDatasetInfo: jest.fn() }));

const source = { provider: 'hf' as const, repo: 'acme/zod-png', revision: 'a'.repeat(40) };
const info = {
  gated: false,
  tags: ['task_categories:image-segmentation', 'modality:image', 'zod', 'lidar'],
  cardData: { license: ['cc-by-sa-4.0'], pretty_name: 'ZOD PNG', task_categories: ['image-segmentation'], language: 'en', size_categories: ['10K<n<100K'] },
  siblings: [
    { rfilename: 'README.md', size: 10 },
    { rfilename: 'train/camera/1.png', size: 300 },
    { rfilename: 'train/camera/2.png', size: 200 },
    { rfilename: 'val/camera/3.png', size: 50 },
    { rfilename: 'broken' }
  ]
};

beforeEach(() => {
  jest.clearAllMocks();
  clearHubCache();
});

describe('summarize', () => {
  it('reads the card, groups top-level folders by size, and totals the files', () => {
    expect(summarize(source, info)).toEqual({
      repo: 'acme/zod-png',
      revision: source.revision,
      license: 'cc-by-sa-4.0',
      prettyName: 'ZOD PNG',
      tags: ['zod', 'lidar'],
      taskCategories: ['image-segmentation'],
      languages: ['en'],
      sizeCategories: ['10K<n<100K'],
      gated: false,
      fileCount: 5,
      totalBytes: 560,
      folders: [{ path: 'train', files: 2, bytes: 500 }, { path: 'val', files: 1, bytes: 50 }],
      files: info.siblings.map(file => ({ path: file.rfilename, size: file.size })),
      truncated: false
    });
  });

  it('copes with a bare repo: no card, no files, a gated flag as text', () => {
    expect(summarize(source, { gated: 'auto' })).toMatchObject({ license: undefined, tags: [], fileCount: 0, totalBytes: 0, folders: [], gated: true });
  });

  it('shows the first hundred files and says there are more', () => {
    const siblings = Array.from({ length: 150 }, (_, i) => ({ rfilename: `f${i}.png`, size: 1 }));
    const summary = summarize(source, { siblings });
    expect(summary.files).toHaveLength(100);
    expect(summary).toMatchObject({ fileCount: 150, truncated: true });
  });
});

describe('hubSummary', () => {
  it('asks the Hub once per commit and then answers from memory', async () => {
    jest.mocked(fetchDatasetInfo).mockResolvedValue(info);
    await hubSummary(source);
    await hubSummary(source);
    expect(fetchDatasetInfo).toHaveBeenCalledTimes(1);
    await hubSummary({ ...source, revision: 'b'.repeat(40) });
    expect(fetchDatasetInfo).toHaveBeenCalledTimes(2);
  });

  it('forgets an answer after an hour, and the oldest once it holds too many', async () => {
    jest.mocked(fetchDatasetInfo).mockResolvedValue(info);
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(0);
    await hubSummary(source);
    now.mockReturnValue(61 * 60 * 1000);
    await hubSummary(source);
    expect(fetchDatasetInfo).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 205; i += 1) await hubSummary({ ...source, repo: `acme/r${i}` });
    await hubSummary(source);
    expect(fetchDatasetInfo).toHaveBeenCalledTimes(2 + 205 + 1);
    now.mockRestore();
  });

  it('does not keep a failure', async () => {
    jest.mocked(fetchDatasetInfo).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(info);
    await expect(hubSummary(source)).rejects.toThrow('down');
    await expect(hubSummary(source)).resolves.toMatchObject({ fileCount: 5 });
  });
});
