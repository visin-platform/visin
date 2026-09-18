jest.mock('../../datasets', () => ({
  datasets: { list: jest.fn(), get: jest.fn() }
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { datasets } from '../../datasets';
import { VisinError } from '../../http';
import { datasetRead } from '../../tools/dataset';

type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ text: string }>;
}>;

const mocked = datasets as unknown as Record<string, jest.Mock>;

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
  it('names each dataset with its size, image count and id', async () => {
    mocked.list.mockResolvedValue({
      datasets: [
        { _id: 'd1', name: 'Highway', description: 'Night runs\nmore detail', imageCount: 1200, groups: [], archive: { filename: 'h.zip', size: 3.6 * 1024 ** 3 } },
        { _id: 'd2', name: 'Urban', imageCount: 0, groups: [] }
      ],
      pagination: { total: 2 }
    });

    const { text } = await call('list_datasets', { search: 'h' });

    expect(mocked.list).toHaveBeenCalledWith('vsn_live_abc', { search: 'h', limit: 30 });
    expect(text).toContain('- Highway — Night runs (1,200 images, 3.6 GB)  [d1]');
    expect(text).toContain('- Urban (0 images)  [d2]');
  });

  it('says how many more there are when the page is not everything', async () => {
    mocked.list.mockResolvedValue({ datasets: [{ _id: 'd1', name: 'Highway', imageCount: 1, groups: [] }], pagination: { total: 40 } });
    expect((await call('list_datasets', { limit: 1 })).text).toContain('1 of 40 datasets');
  });

  it('reports an empty result plainly, and an error as an error', async () => {
    mocked.list.mockResolvedValueOnce({ datasets: [] });
    expect((await call('list_datasets')).text).toBe('No datasets match that.');
    mocked.list.mockRejectedValueOnce(new VisinError('dataset-service unavailable', 503));
    expect((await call('list_datasets')).isError).toBe(true);
  });
});

describe('get_dataset', () => {
  it('describes the zip, its contents and the imported groups', async () => {
    mocked.get.mockResolvedValue({
      _id: 'd1',
      name: 'VLM',
      description: 'Mask review set',
      archive: { filename: 'vlm.zip', size: 2048 },
      imageCount: 8220,
      groups: [
        { name: 'frames', images: 4110, jsons: 0 },
        { name: 'verify', images: 8220, jsons: 4110 }
      ],
      import: { status: 'failed' },
      contents: {
        entries: 16440,
        totalBytes: 512,
        extensions: [{ ext: '.png', files: 8220, bytes: 1 }, { ext: '.json', files: 4110, bytes: 1 }],
        folders: [
          { path: '', depth: 0, files: 16440, images: 12330 },
          { path: 'frames', depth: 1, files: 4110, images: 4110 },
          { path: 'annotations/verify', depth: 2, files: 12330, images: 8220 }
        ]
      }
    });

    const { text } = await call('get_dataset', { dataset: 'd1' });

    expect(mocked.get).toHaveBeenCalledWith('vsn_live_abc', 'd1');
    expect(text).toContain('VLM\nMask review set\nvlm.zip, 2.0 KB; 8,220 images imported; last import failed.');
    expect(text).toContain('  verify: 8,220 images, 4,110 JSON sidecars');
    expect(text).toContain('  frames: 4,110 images\n');
    expect(text).toContain('Zip contents: 16,440 files, 512 B uncompressed.');
    expect(text).toContain('  by type: .png 8,220, .json 4,110');
    expect(text).toContain('  frames/: 4,110 files, 4,110 images');
    expect(text).not.toContain('annotations/verify/');
  });

  it('keeps a bare dataset short and caps a long folder list', async () => {
    mocked.get.mockResolvedValueOnce({ _id: 'd1', name: 'Empty', imageCount: 0, groups: [] });
    expect((await call('get_dataset', { dataset: 'd1' })).text).toBe('Empty\nno zip uploaded yet; 0 images imported.');

    mocked.get.mockResolvedValueOnce({
      _id: 'd2', name: 'Sequences', imageCount: 0, groups: [], import: { status: 'done' },
      contents: { entries: 25, totalBytes: 25, extensions: [], folders: Array.from({ length: 25 }, (_, i) => ({ path: `s${i}`, depth: 1, files: 1, images: 0 })) }
    });
    const { text } = await call('get_dataset', { dataset: 'd2' });
    expect(text).toContain('…and 5 more folders');
    expect(text).not.toContain('by type');
    expect(text).not.toContain('last import');
  });

  it('turns a failed lookup into an error the model can read', async () => {
    mocked.get.mockRejectedValue(new VisinError('Dataset not found', 404));
    const result = await call('get_dataset', { dataset: 'missing' });
    expect(result.isError).toBe(true);
  });
});
