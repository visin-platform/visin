import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithClient } from '../test/renderWithClient';
import type { ModelOutputs } from '../types/modelOutputs';

vi.mock('../services/modelOutputsService', () => ({ modelOutputsService: { get: vi.fn() } }));
vi.mock('../services/projectService', () => ({ projectService: { getProjectById: vi.fn() } }));

import ModelOutputsPage from './ModelOutputsPage';
import { modelOutputsService } from '../services/modelOutputsService';
import { projectService } from '../services/projectService';

const get = vi.mocked(modelOutputsService.get);
const getProject = vi.mocked(projectService.getProjectById);

const outputs = (overrides: Partial<ModelOutputs> = {}): ModelOutputs => ({
  run: { id: 't1', uuid: 'u1', name: 'ISEAUTO CLFT Large', project: { id: 'p1', name: 'Team project' }, epoch: 99, epochUuid: 'e99' },
  model: {
    id: 'm1',
    format: 'pth',
    filename: 'clft-epoch99.pth',
    size: 1024,
    sha256: 'a'.repeat(64),
    epoch: 99,
    license: { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    credit: 'TalTech',
    modelInfo: { backbone: 'clft', train_classes: [{ name: 'road', index: 0 }, { name: 'car', index: 1 }], transforms: { resize: 384 } },
    parity: { maxAbsDiff: 0.00012, argmaxMismatchFraction: 0.0005, frames: 8 },
    file: '/api/trainings/t1/models/m1/file'
  },
  sameCheckpoint: [{ id: 'm2', format: 'onnx', size: 2048, sha256: 'b'.repeat(64), file: '/api/trainings/t1/models/m2/file' }],
  trainedOn: { source: 'visin', id: 'iseauto', name: 'Iseauto', revision: '2026-02-17' },
  checkpoint: { epoch: 99, sha256: 'a'.repeat(64) },
  predictedOn: [
    { dataset: { source: 'visin', id: 'sample', archiveRevision: 'sample-v1' }, frames: ['f1', 'f2'] },
    { dataset: null, frames: ['f3'] }
  ],
  outputGeometry: { coordinateSpace: 'input-image', modelInput: null, mapping: 'Resize class logits bilinearly.' },
  confidence: { quantity: 'p_max', range: '[1/C, 1]', encodings: { uint8: 'round(255 * p)' } },
  folders: { mask: 'Class indices.', segment: 'Coloured.', confidence: 'Probability.' },
  totals: { mask: 3, segment: 3, confidence: 0 },
  metrics: {
    epoch: 99,
    results: { val: { mean_iou: 0.8123456789, loss_ms: 12.5 }, lr: 0.00001, note: 'kept out' },
    evaluations: [
      { id: 'ev1', suite: { slug: 'road-test', version: 2 }, executedAt: '2026-10-11T00:00:00.000Z', sampleCounts: { day: 100, night: 50 }, results: {} },
      { id: 'ev2' }
    ]
  },
  files: [],
  truncated: false,
  ...overrides
});

const renderPage = () =>
  renderWithClient(<ModelOutputsPage />, { path: '/trainings/t1/models/m1', route: '/trainings/:id/models/:modelId' });

describe('ModelOutputsPage', () => {
  beforeEach(() => {
    get.mockReset();
    getProject.mockReset();
    getProject.mockResolvedValue({
      success: true,
      data: { taxonomy: { metrics: [{ key: 'mean_iou', label: 'Mean IoU', format: 'percent', decimals: 3 }, { key: 'loss_ms', format: 'ms' }] } }
    } as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lays out the checkpoint, the model, its data and outputs, and links to the frames', async () => {
    get.mockResolvedValue(outputs());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'clft-epoch99.pth' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('t1', 'm1');

    expect(screen.getByRole('link', { name: 'View frames' })).toHaveAttribute('href', '/visualizations?training=u1&view=outputs&epoch=99');
    expect(screen.getByRole('link', { name: 'Download weights (1.0 KB)' })).toHaveAttribute('href', 'http://localhost:4010/api/trainings/t1/models/m1/file');
    expect(screen.getByText(/The checkpoint from epoch 99 of/)).toHaveTextContent('in Team project, and what it predicted on 3 frames.');

    const checkpoint = within(screen.getByRole('region', { name: 'Checkpoint' }));
    expect(checkpoint.getByText('PyTorch (.pth)')).toBeInTheDocument();
    expect(checkpoint.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    expect(checkpoint.getByText('TalTech')).toBeInTheDocument();
    expect(checkpoint.getByRole('link', { name: /ONNX \(\.onnx\)/ })).toHaveAttribute('href', 'http://localhost:4010/api/trainings/t1/models/m2/file');
    expect(checkpoint.getByText('0.05% of pixels get a different class; the largest difference in output is 0.00012 (checked on 8 frames)')).toBeInTheDocument();
    expect(checkpoint.getByTitle('a'.repeat(64))).toHaveTextContent(`${'a'.repeat(12)}…aaaa`);

    const model = within(screen.getByRole('region', { name: 'Model' }));
    expect(model.getByText('clft')).toBeInTheDocument();
    expect(model.getByText('input 384 px')).toBeInTheDocument();
    expect(model.getByText('Preprocessing')).toBeInTheDocument();
    expect(model.queryByText('Input mode')).not.toBeInTheDocument();
    expect(model.getByText('car')).toBeInTheDocument();

    const data = within(screen.getByRole('region', { name: 'Data' }));
    expect(data.getByRole('link', { name: 'Iseauto · 2026-02-17' })).toHaveAttribute('href', '/datasets/iseauto');
    expect(data.getByRole('link', { name: 'sample · sample-v1' })).toBeInTheDocument();
    expect(data.getByText(/Not stated when the outputs were uploaded/)).toBeInTheDocument();

    const kinds = within(screen.getByRole('table', { name: 'Outputs by kind' }));
    expect(kinds.getByText(/The class the model chose for every pixel/)).toBeInTheDocument();
    expect(kinds.getAllByRole('row')).toHaveLength(4);
    fireEvent.click(screen.getByText('Reading the files in your own code'));
    expect(screen.getByText('Class indices.')).toBeInTheDocument();
    expect(screen.getByText('p_max, in [1/C, 1]. Stored as uint8: round(255 * p).')).toBeInTheDocument();
    expect(screen.getByText('In input-image coordinates. Resize class logits bilinearly.')).toBeInTheDocument();
  });

  it('lists the epoch’s numbers and the tests of the checkpoint', async () => {
    get.mockResolvedValue(outputs());
    renderPage();
    const results = within(await screen.findByRole('table', { name: 'Epoch results' }));
    expect(results.getByText('Validation')).toBeInTheDocument();
    expect(results.getByText('val.mean_iou')).toBeInTheDocument();
    // The project's taxonomy decides how a number reads once it has loaded.
    expect(await results.findByText('81.2%')).toBeInTheDocument();
    expect(results.getByText('12.5000 ms')).toBeInTheDocument();
    expect(results.getByText('1.00e-5')).toBeInTheDocument();
    expect(results.queryByText('note')).not.toBeInTheDocument();
    expect(getProject).toHaveBeenCalledWith('p1');
    expect(screen.getByText(/road-test@2 · .* · 150 samples/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Test without a suite'));
    expect(screen.getAllByRole('link', { name: 'Open the evaluation' }).map((link) => link.getAttribute('href'))).toContain('/evaluations/ev2');
  });

  it('shows the answer as JSON, to copy or download', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const createObjectURL = vi.fn(() => 'blob:outputs');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    get.mockResolvedValue(outputs());
    renderPage();
    fireEvent.click(await screen.findByText('All of this as JSON'));
    expect(screen.getByText(/"sha256": "a{64}"/, { selector: 'pre' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"filename": "clft-epoch99.pth"'));
    fireEvent.click(screen.getByRole('button', { name: 'Download .json' }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the file SHA-256' }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('a'.repeat(64)));
  });

  it('says when the browser will not copy', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } });
    get.mockResolvedValue(outputs());
    renderPage();
    fireEvent.click(await screen.findByText('All of this as JSON'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('status')).toHaveTextContent('The browser would not allow copying');
  });

  it('says what is missing rather than inventing it', async () => {
    get.mockResolvedValue(
      outputs({
        model: { ...outputs().model, license: undefined, credit: undefined, modelInfo: undefined, parity: undefined },
        sameCheckpoint: [],
        trainedOn: undefined,
        predictedOn: [],
        totals: { mask: 0, segment: 0, confidence: 0 },
        metrics: { epoch: 99, evaluations: [] },
        files: [{ visualizationUuid: 'v', folder: 'mask', frame: 'f', filename: 'f.png' }],
        truncated: true
      })
    );
    renderPage();
    expect(await screen.findByText('Not stated')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View frames' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('No outputs uploaded yet')).toBeInTheDocument();
    expect(screen.getByText('The epoch reported no numbers.')).toBeInTheDocument();
    expect(screen.getByText('No test you can see scored this checkpoint.')).toBeInTheDocument();
    expect(screen.getByText(/The JSON lists the first 1 outputs/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Model' })).getAllByText('Not recorded')).toHaveLength(2);
  });

  it('says when the outputs cannot be loaded', async () => {
    get.mockRejectedValue(new Error('This model declares no licence; state one before serving it'));
    renderPage();
    expect(await screen.findByText('This model declares no licence; state one before serving it')).toBeInTheDocument();
  });
});
