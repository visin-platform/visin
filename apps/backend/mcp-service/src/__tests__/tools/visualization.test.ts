jest.mock('../../vision', () => ({
  vision: {
    getTraining: jest.fn(),
    listVisualizations: jest.fn(),
    listVisualizationTypes: jest.fn(),
    getVisualization: jest.fn(),
    getTrainingSummary: jest.fn(),
    getModelOutputs: jest.fn()
  }
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  fetchWithTimeout: jest.fn()
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { png as pngFile, greyPng } from '../fixtures/png';
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
  signedUrl: 'https://file-api.example.test/files/download/x?sig=abc',
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
  mocked.getTraining.mockResolvedValue({ uuid: 't-uuid' });
  mocked.listVisualizationTypes.mockResolvedValue({ types: ['overlay', 'compare'] });
});

describe('list_visualizations', () => {
  it('names each frame with the id needed to view it, and the kinds available', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [frame()], total: 2000 });

    const { text } = await call('list_visualizations', { training: 't-uuid' });

    expect(text).toContain('1 of 2,000 frames');
    expect(text).toContain('kinds available: overlay, compare');
    expect(text).toContain('- epoch 99 — frame_0092.png');
    expect(text).toContain('overlay [v1]');
    expect(text).toContain('view_visualizations');
  });

  it('groups the renders of one frame rather than repeating its filename', async () => {
    // A run renders the same scene four ways, and these filenames are long —
    // a real one measured 79 characters, so a flat list spent about a third of
    // the answer restating five of them.
    mocked.listVisualizations.mockResolvedValue({
      visualizations: [
        frame({ visualization_uuid: 'v1', type: 'overlay' }),
        frame({ visualization_uuid: 'v2', type: 'compare' }),
        frame({ visualization_uuid: 'v3', type: 'segment', epoch: 50 })
      ]
    });

    const { text } = await call('list_visualizations', { training: 't-uuid' });

    expect(text).toContain('compare [v2] · overlay [v1]');
    expect(text.match(/frame_0092\.png/g)).toHaveLength(2); // epoch 99 and epoch 50
    expect(text).toContain('- epoch 50 — frame_0092.png');
  });

  it('passes the filters through, with a page so the limit is honoured', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [frame()] });

    await call('list_visualizations', { training: 't-uuid', type: 'compare', epoch: 40, limit: 5 });

    expect(mocked.listVisualizations).toHaveBeenCalledWith('vsn_live_abc', 't-uuid', {
      type: 'compare',
      limit: 5,
      epoch: 40
    });
  });

  it('says when an epoch has none of what was asked for', async () => {
    mocked.listVisualizations.mockResolvedValue({ visualizations: [] });

    const { text } = await call('list_visualizations', { training: 't-uuid', type: 'mask', epoch: 7 });

    expect(text).toBe('No frames of kind mask at epoch 7. This run has these kinds: overlay, compare.');
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

    expect(mocked.listVisualizations.mock.calls[0][2].limit).toBe(20);
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

const serve = (bytes: Buffer) =>
  fetched.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  });
const storedModel = (over: Record<string, unknown> = {}) => ({
  _id: 'm1',
  provider: 'visin',
  format: 'pth',
  filename: 'clft-epoch99.pth',
  size: 1.2 * 1024 ** 3,
  status: 'ready',
  epoch: 99,
  license: { id: 'cc-by-4.0', name: 'CC BY 4.0' },
  modelInfo: { train_classes: [{ name: 'road', index: 0 }, { name: 'car', index: 1 }] },
  ...over
});

describe('view_visualizations — a model’s outputs', () => {
  it('paints a mask and names its classes from the run’s stored weights', async () => {
    mocked.getVisualization.mockResolvedValue(frame({ type: 'mask' }));
    mocked.getTrainingSummary.mockResolvedValue({ models: [storedModel()] });
    const stored = greyPng(1, 1, 1, 0);
    serve(stored);

    const { text, images } = await call('view_visualizations', { visualizations: ['v1'], training: 't1' });

    expect(mocked.getTrainingSummary).toHaveBeenCalledWith('vsn_live_abc', 't1');
    expect(text).toContain('image 1: [mask] epoch 99 — frame_0092.png: painted mask, orange = car (75%), blue = road (25%).');
    expect(Buffer.from(images[0].data!, 'base64').equals(stored)).toBe(false);
  });

  it('paints a confidence map with how sure the model was', async () => {
    mocked.getVisualization.mockResolvedValue(frame({ type: 'confidence' }));
    mocked.getTrainingSummary.mockResolvedValue({ models: [storedModel()] });
    serve(greyPng(255, 0));

    const { text } = await call('view_visualizations', { visualizations: ['v1'], training: 't1' });

    expect(text).toContain('painted confidence, dark = unsure (p 0.50)');
    expect(text).toContain('50% of pixels below p 0.5');
  });

  it('still paints, with numbered classes, when the run cannot be read or was not named', async () => {
    mocked.getVisualization.mockResolvedValue(frame({ type: 'mask' }));
    mocked.getTrainingSummary.mockRejectedValue(new VisinError('Training not found', 404));
    serve(greyPng(2));

    const named = await call('view_visualizations', { visualizations: ['v1'], training: 'gone' });
    expect(named.text).toContain('green = class 2 (100%)');

    const unnamed = await call('view_visualizations', { visualizations: ['v1'] });
    expect(unnamed.text).toContain('pass the training to name them');
    expect(mocked.getTrainingSummary).toHaveBeenCalledTimes(1);
  });

  it('shows a mask saved with its own colours as it is, and leaves other kinds unpainted', async () => {
    mocked.getVisualization.mockResolvedValue(frame({ type: 'mask' }));
    serve(pngFile({ rows: [[0, 1]], colour: 3, palette: [[0, 0, 0], [200, 10, 10]] }));
    expect((await call('view_visualizations', { visualizations: ['v1'] })).text).toContain('shown as stored (it carries its own colours)');

    mocked.getVisualization.mockResolvedValue(frame({ type: 'segment' }));
    serve(greyPng(1));
    const segment = await call('view_visualizations', { visualizations: ['v1'] });
    expect(segment.text.endsWith('image 1: [segment] epoch 99 — frame_0092.png')).toBe(true);
  });
});

describe('get_model_outputs', () => {
  const outputs = (over: Record<string, unknown> = {}) => ({
    run: { id: 't1', name: 'ISEAUTO CLFT', epoch: 99, project: { name: 'Team project' } },
    model: {
      id: 'm1',
      format: 'pth',
      filename: 'clft-epoch99.pth',
      size: 1.2 * 1024 ** 3,
      license: { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      credit: 'TalTech',
      modelInfo: { train_classes: [{ name: 'road', index: 0 }, { name: 'car', index: 1 }], transforms: { resize: 384, image_mean: [0.485, 0.456] } },
      parity: { maxAbsDiff: 0.00012, argmaxMismatchFraction: 0.0005, frames: 8 },
      file: '/api/trainings/t1/models/m1/file'
    },
    sameCheckpoint: [
      { format: 'onnx', size: 600 * 1024 ** 2, file: '/api/trainings/t1/models/m2/file' },
      { format: 'onnx', size: 300 * 1024, file: '/api/trainings/t1/models/m3/file' }
    ],
    trainedOn: { id: 'iseauto', name: 'Iseauto', revision: '2026-02-17' },
    checkpoint: { epoch: 99, sha256: 'a'.repeat(64) },
    predictedOn: [
      { dataset: { id: 'sample', archiveRevision: 'sample-v1' }, frames: ['f1', 'f2'] },
      { dataset: null, frames: ['f3'] }
    ],
    totals: { mask: 3, segment: 3, confidence: 0 },
    metrics: {
      epoch: 99,
      results: { val: { mean_iou: 0.81234567 } },
      evaluations: [{ id: 'e1', suite: { slug: 'road-test', version: 2 }, executedAt: '2026-10-11T00:00:00Z', sampleCounts: { day: 100, night: 50 } }, { id: 'e2' }]
    },
    ...over
  });

  it('describes the newest served checkpoint, its data, outputs and tests, and how to look at its frames', async () => {
    mocked.getTrainingSummary.mockResolvedValue({
      models: [
        { repo: 'org/model', revision: 'abc1234' },
        storedModel({ _id: 'old', epoch: 50, filename: 'clft-epoch50.pth' }),
        storedModel({ _id: 'onnx', format: 'onnx', filename: 'clft-epoch99.onnx' }),
        storedModel()
      ]
    });
    mocked.getModelOutputs.mockResolvedValue(outputs());

    const { text } = await call('get_model_outputs', { training: 't1' });

    expect(mocked.getModelOutputs).toHaveBeenCalledWith('vsn_live_abc', 't1', 'm1');
    expect(text).toContain('clft-epoch99.pth: the checkpoint from epoch 99 of "ISEAUTO CLFT" in Team project.');
    expect(text).toContain('Format pth, 1.20 GB. Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/; credit: TalTech).');
    expect(text).toContain('Weights: GET /api/trainings/t1/models/m1/file on this deployment\'s API. Also stored as onnx (600 MB), onnx (300 KB).');
    expect(text).toContain(`Checkpoint SHA-256: ${'a'.repeat(64)}.`);
    expect(text).toContain('0.05% of pixels change class, largest output difference 0.00012 (on 8 frames)');
    expect(text).toContain('Classes: 0 road, 1 car.');
    expect(text).toContain('Preprocessing: resize 384, image_mean 0.485/0.456.');
    expect(text).toContain('Trained on: Iseauto @ 2026-02-17.');
    expect(text).toContain('Predicted on: sample @ sample-v1, 2 frames; a dataset the upload did not name, 1 frame.');
    expect(text).toContain('Outputs at epoch 99: 3 segment, 3 mask, 0 confidence.');
    expect(text).toContain('What epoch 99 reported: val.mean_iou 0.8123.');
    expect(text).toContain('Tests of this checkpoint: road-test@2 (2026-10-11, 150 samples); a test without a suite.');
    expect(text).toContain('Other checkpoints: clft-epoch50.pth, epoch 50 [old].');
  });

  it('describes the checkpoint asked for, and says plainly what is missing', async () => {
    mocked.getTrainingSummary.mockResolvedValue({ models: [storedModel(), storedModel({ _id: 'old', epoch: 50 })] });
    mocked.getModelOutputs.mockResolvedValue(
      outputs({
        model: { ...outputs().model, license: undefined, credit: undefined, modelInfo: undefined, parity: undefined, size: undefined },
        sameCheckpoint: [],
        trainedOn: undefined,
        checkpoint: { epoch: 50 },
        predictedOn: [],
        metrics: { epoch: 50, evaluations: [] }
      })
    );

    const { text } = await call('get_model_outputs', { training: 't1', model: 'old' });

    expect(mocked.getModelOutputs).toHaveBeenCalledWith('vsn_live_abc', 't1', 'old');
    expect(text).toContain('Licence: not stated by the publisher');
    expect(text).toContain('Checkpoint SHA-256: not recorded.');
    expect(text).toContain('Classes: not named by the weights.');
    expect(text).toContain('Trained on: not recorded.');
    expect(text).toContain('Predicted on: nothing uploaded yet.');
    expect(text).toContain('No test you can see scored this checkpoint.');
    expect(text).not.toContain('Other checkpoints');
    expect(text).not.toContain('Preprocessing');
  });

  it('says why no checkpoint is served, rather than failing on one', async () => {
    mocked.getTrainingSummary.mockResolvedValue({
      models: [storedModel({ status: 'verifying' }), storedModel({ _id: 'm2', license: undefined, filename: undefined })]
    });

    const { text } = await call('get_model_outputs', { training: 't1' });

    expect(text).toBe(
      'None of this run’s models is served yet, so their outputs are not either: clft-epoch99.pth is verifying; pth checkpoint has no licence stated.'.replace('’', "'")
    );
    expect(mocked.getModelOutputs).not.toHaveBeenCalled();
  });

  it('says when a run keeps no model, or not the one asked for', async () => {
    mocked.getTrainingSummary.mockResolvedValue({ models: [{ repo: 'org/model', revision: 'abc1234' }] });
    expect((await call('get_model_outputs', { training: 't1' })).text).toContain('This run keeps no model on Visin.');

    mocked.getTrainingSummary.mockResolvedValue({ models: [storedModel()] });
    expect((await call('get_model_outputs', { training: 't1', model: 'nope' })).text).toBe(
      'This run has no stored model nope. Its models: clft-epoch99.pth [m1].'
    );
  });

  it('passes on why the outputs were refused', async () => {
    mocked.getTrainingSummary.mockResolvedValue({ models: [storedModel()] });
    mocked.getModelOutputs.mockRejectedValue(new VisinError('This run has no recorded epoch 99', 409));

    const { text, isError } = await call('get_model_outputs', { training: 't1' });

    expect(isError).toBe(true);
    expect(text).toContain('no recorded epoch 99');
  });
});
