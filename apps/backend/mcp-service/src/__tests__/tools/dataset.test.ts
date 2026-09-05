jest.mock('../../vision', () => ({
  vision: {
    listDatasets: jest.fn(),
    getDataset: jest.fn(),
    listImageCategories: jest.fn()
  }
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vision } from '../../vision';
import { VisinError } from '../../http';
import { datasetRead } from '../../tools/dataset';

type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ text: string }>;
}>;

const mocked = vision as unknown as Record<string, jest.Mock>;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const found: Record<string, Handler> = {};
  const server = {
    registerTool: (toolName: string, _config: unknown, handler: Handler) => {
      found[toolName] = handler;
    }
  } as unknown as McpServer;
  datasetRead.register(server, { token: 'vsn_live_abc' });

  const result = await found[name](args);
  return { text: result.content[0].text, isError: result.isError === true };
};

beforeEach(() => jest.clearAllMocks());

describe('list_datasets', () => {
  it('names each dataset with the identifier the other tools take', async () => {
    mocked.listDatasets.mockResolvedValue({
      datasets: [
        { _id: 'd1', uuid: 'uuid-1', name: 'Highway', description: 'Night runs' },
        { _id: 'd2', name: 'Urban' }
      ],
      pagination: { total: 2 }
    });

    const { text } = await call('list_datasets');

    expect(text).toContain('Highway — Night runs  [uuid-1]');
    expect(text).toContain('Urban  [d2]');
  });

  it('says how many more there are when the page is not everything', async () => {
    mocked.listDatasets.mockResolvedValue({
      datasets: [{ _id: 'd1', name: 'Highway' }],
      pagination: { total: 40 }
    });

    expect((await call('list_datasets')).text).toContain('1 of 40 datasets');
  });

  it('reports an empty result plainly', async () => {
    mocked.listDatasets.mockResolvedValue({ datasets: [] });
    expect((await call('list_datasets', { search: 'lidar' })).text).toBe('No datasets match that.');
  });
});

describe('get_dataset', () => {
  it('flattens the scalar metadata a dataset carries', async () => {
    mocked.getDataset.mockResolvedValue({
      _id: 'd1',
      name: 'Highway',
      description: 'Night runs',
      timestamp: '2026-07-04T08:00:00Z',
      dataset_info: { frames: 12_000, split: 'train' },
      annotations: { format: 'coco' }
    });

    const { text } = await call('get_dataset', { dataset: 'd1' });

    expect(text).toContain('Highway');
    expect(text).toContain('Captured 2026-07-04.');
    expect(text).toContain('frames: 12000');
    expect(text).toContain('format: coco');
  });

  it('summarises a nested blob instead of rendering it', async () => {
    // These are usually per-sensor calibration matrices: hundreds of tokens
    // that answer nothing anyone asked, and re-sent on every later turn.
    mocked.getDataset.mockResolvedValue({
      _id: 'd1',
      name: 'Highway',
      camera: { intrinsics: { fx: 1, fy: 2, cx: 3, cy: 4 }, frames: [1, 2, 3] }
    });

    const { text } = await call('get_dataset', { dataset: 'd1' });

    expect(text).toContain('intrinsics: 4 fields');
    expect(text).toContain('frames: 3 entries');
    expect(text).not.toContain('fx');
  });

  it('skips a blob that is absent or empty rather than printing a bare heading', async () => {
    mocked.getDataset.mockResolvedValue({
      _id: 'd1',
      name: 'Highway',
      annotations: {},
      lidar: { sensors: 2 }
    });

    const { text } = await call('get_dataset', { dataset: 'd1' });

    expect(text).not.toContain('Annotations:');
    expect(text).toContain('Lidar:');
  });

  it('drops a null field without turning it into the string "null"', async () => {
    mocked.getDataset.mockResolvedValue({
      _id: 'd1',
      name: 'Highway',
      dataset_info: { frames: 10, notes: null }
    });

    const { text } = await call('get_dataset', { dataset: 'd1' });

    expect(text).toContain('frames: 10');
    expect(text).not.toContain('notes');
  });
});

describe('list_image_categories', () => {
  it('lists the label vocabulary', async () => {
    mocked.listImageCategories.mockResolvedValue([
      { _id: 'c1', name: 'car', description: 'Any four-wheeled vehicle' },
      { _id: 'c2', name: 'pedestrian' }
    ]);

    const { text } = await call('list_image_categories', { dataset: 'd1' });

    expect(text).toContain('2 categories:');
    expect(text).toContain('- car — Any four-wheeled vehicle');
    expect(text).toContain('- pedestrian');
  });

  it('reports a dataset with no categories defined', async () => {
    mocked.listImageCategories.mockResolvedValue([]);

    expect((await call('list_image_categories', { dataset: 'd1' })).text).toContain(
      'no image categories defined'
    );
  });

  it('turns a failure into something the model can act on', async () => {
    mocked.listImageCategories.mockRejectedValue(new VisinError('Access denied', 403));

    const { text, isError } = await call('list_image_categories', { dataset: 'd1' });

    expect(isError).toBe(true);
    expect(text).toContain('Do not retry');
  });
});
