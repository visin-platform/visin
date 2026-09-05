jest.mock('../../vision', () => ({
  vision: {
    listVisualizations: jest.fn(),
    listVisualizationTypes: jest.fn(),
    getVisualization: jest.fn()
  }
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  fetchWithTimeout: jest.fn()
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchWithTimeout } from '@visin/backend-core';
import { vision } from '../../vision';
import { VisinError } from '../../http';
import { visualizationRead } from '../../tools/visualization';

const mocked = vision as unknown as Record<string, jest.Mock>;
const fetched = fetchWithTimeout as unknown as jest.Mock;

type Content = { type: string; text?: string; data?: string; mimeType?: string };
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Content[] }>;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const found: Record<string, Handler> = {};
  const server = {
    registerTool: (toolName: string, _c: unknown, handler: Handler) => {
      found[toolName] = handler;
    }
  } as unknown as McpServer;
  visualizationRead.register(server, { token: 'vsn_live_abc' });

  const result = await found[name](args);
  return {
    text: result.content[0].text ?? '',
    images: result.content.filter(c => c.type === 'image'),
    isError: result.isError === true
  };
};

const frame = (over: Record<string, unknown> = {}) => ({
  visualization_uuid: 'v1',
  type: 'overlay',
  epoch: 99,
  filename: 'frame_0092.png',
  signedUrl: 'https://file-api.visin.eu/files/download/x?sig=abc',
  ...over
});

const png = (bytes = 1024) =>
  fetched.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => new ArrayBuffer(bytes)
  });

beforeEach(() => {
  jest.clearAllMocks();
  mocked.listVisualizationTypes.mockResolvedValue({ types: ['overlay', 'compare'] });
});

describe('list_visualizations', () => {
  it('names each frame with the id needed to view it, and the kinds available', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [frame()], total: 2000 });

    const { text } = await call('list_visualizations', { training: 't-uuid' });

    expect(text).toContain('1 of 2,000 frames');
    expect(text).toContain('kinds available: overlay, compare');
    expect(text).toContain('[overlay] epoch 99 — frame_0092.png  [v1]');
    expect(text).toContain('view_visualizations');
  });

  it('passes the filters through, with a page so the limit is honoured', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [frame()] });

    await call('list_visualizations', { training: 't-uuid', type: 'compare', epoch: 40, limit: 5 });

    expect(mocked.listVisualizations).toHaveBeenCalledWith('vsn_live_abc', {
      training_uuid: 't-uuid',
      type: 'compare',
      epoch: 40,
      limit: 5
    });
  });

  it('suggests the kinds that do exist when a filter matches nothing', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [] });

    const { text } = await call('list_visualizations', { training: 't-uuid', type: 'nope' });

    expect(text).toContain('overlay, compare');
  });

  it('says plainly when a run rendered nothing at all', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [] });
    mocked.listVisualizationTypes.mockResolvedValue({ types: [] });

    const { text } = await call('list_visualizations', { training: 't-uuid' });

    expect(text).toBe('This run rendered no visualizations.');
  });
});

describe('list_visualizations — edges', () => {
  it('drops the "of N" when the endpoint reports no total', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [frame()] });

    const { text } = await call('list_visualizations', { training: 't-uuid' });

    // Only the header matters here; the closing sentence also contains " of ".
    expect(text.split('\n')[0]).toBe('1 frames (kinds available: overlay, compare):');
  });

  it('says the kinds are unknown rather than printing an empty list', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [frame()] });
    mocked.listVisualizationTypes.mockResolvedValue({ types: [] });

    const { text } = await call('list_visualizations', { training: 't-uuid' });

    expect(text).toContain('kinds available: unknown');
  });

  it('caps a long listing and says what it left out', async () => {
    mocked.listVisualizations.mockResolvedValue({
      visualizations: Array.from({ length: 80 }, (_, i) => frame({ visualization_uuid: `v${i}` }))
    });

    const { text } = await call('list_visualizations', { training: 't-uuid' });

    expect(text).toContain('first 50 of 80 frames');
  });

  it('defaults the limit when none is given', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [] });

    await call('list_visualizations', { training: 't-uuid' });

    expect(mocked.listVisualizations.mock.calls[0][1].limit).toBe(20);
  });
});

describe('list_visualizations — failure', () => {
  it('turns an API failure into something the model can act on', async () => {
    mocked.listVisualizations.mockRejectedValue(new VisinError('Training not found', 404));

    const { text, isError } = await call('list_visualizations', { training: 'nope' });

    expect(isError).toBe(true);
    expect(text).toContain('private project');
  });
});

describe('view_visualizations', () => {
  it('returns the actual image, captioned in the order it appears', async () => {
    mocked.getVisualization.mockResolvedValue(frame());
    png();

    const { text, images } = await call('view_visualizations', { visualizations: ['v1'] });

    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toBe('image/png');
    expect(images[0].data).toEqual(expect.any(String));
    // Several overlays of one scene are otherwise indistinguishable.
    expect(text).toContain('image 1: [overlay] epoch 99 — frame_0092.png');
  });

  it('fetches the bytes with the transfer deadline, not the control-plane one', async () => {
    mocked.getVisualization.mockResolvedValue(frame());
    png();

    await call('view_visualizations', { visualizations: ['v1'] });

    expect(fetched.mock.calls[0][1].timeoutMs).toBe(120_000);
    // The signature in the URL is the credential; no bearer token is sent.
    expect(fetched.mock.calls[0][1].headers).toBeUndefined();
  });

  it('shows the frames it could fetch and explains the ones it could not', async () => {
    mocked.getVisualization
      .mockResolvedValueOnce(frame())
      .mockResolvedValueOnce(frame({ visualization_uuid: 'v2', signedUrl: undefined }));
    png();

    const { text, images } = await call('view_visualizations', { visualizations: ['v1', 'v2'] });

    expect(images).toHaveLength(1);
    expect(text).toContain('v2: no download URL');
  });

  it('reports an expired signed URL rather than returning an error page as an image', async () => {
    mocked.getVisualization.mockResolvedValue(frame());
    fetched.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      arrayBuffer: async () => new ArrayBuffer(64)
    });

    const { text, images } = await call('view_visualizations', { visualizations: ['v1'] });

    expect(images).toHaveLength(0);
    expect(text).toContain('not an image');
  });

  it('refuses an image too large for the transport', async () => {
    mocked.getVisualization.mockResolvedValue(frame());
    png(6 * 1024 * 1024);

    const { text, images } = await call('view_visualizations', { visualizations: ['v1'] });

    expect(images).toHaveLength(0);
    expect(text).toContain('too large');
  });

  it('reports a failed download by status', async () => {
    mocked.getVisualization.mockResolvedValue(frame());
    fetched.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });

    const { text } = await call('view_visualizations', { visualizations: ['v1'] });

    expect(text).toContain('HTTP 404');
  });

  it('captions a frame that carries neither epoch nor filename', async () => {
    // The by-uuid endpoint returns less than the listing does; the caption has
    // to degrade rather than print "epoch undefined".
    mocked.getVisualization.mockResolvedValue(
      frame({ epoch: undefined, filename: undefined })
    );
    png();

    const { text, images } = await call('view_visualizations', { visualizations: ['v1'] });

    expect(images).toHaveLength(1);
    expect(text).toContain('image 1: [overlay]');
    expect(text).not.toContain('undefined');
  });

  it('names a missing content type rather than printing nothing', async () => {
    mocked.getVisualization.mockResolvedValue(frame());
    fetched.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(64)
    });

    const { text } = await call('view_visualizations', { visualizations: ['v1'] });

    expect(text).toContain('no content type');
  });

  it('turns a permissions failure into something the model can act on', async () => {
    mocked.getVisualization.mockRejectedValue(new VisinError('Access denied', 403));

    const { text, isError } = await call('view_visualizations', { visualizations: ['v1'] });

    expect(isError).toBe(true);
    expect(text).toContain('Do not retry');
  });
});
