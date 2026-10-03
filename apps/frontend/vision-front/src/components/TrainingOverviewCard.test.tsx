import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { modelService } from '../services/modelService';
import { renderWithClient } from '../test/renderWithClient';
import TrainingOverviewCard from './TrainingOverviewCard';
import { Training, Epoch } from '../types';

const baseTraining: Training = {
  _id: 't1',
  uuid: 'uuid-1',
  training_uuid: 'training-uuid-1',
  name: 'My Training',
  description: 'A test training run',
  datasetId: 'dataset-1',
  status: 'completed',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-02T12:30:00.000Z'
};

const makeEpoch = (epoch: number, overrides: Partial<Epoch> = {}): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'training-uuid-1',
  epoch_uuid: `epoch-uuid-${epoch}`,
  epoch,
  timestamp: '2026-01-01T10:00:00.000Z',
  results: {
    train: { loss: 0.5, mean_iou: 0.7 },
    val: { loss: 0.6, mean_iou: 0.65 }
  },
  epoch_time: 120,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  ...overrides
});

describe('TrainingOverviewCard', () => {
  it('renders training name, status and description', () => {
    render(<TrainingOverviewCard training={baseTraining} epochs={[]} />);
    expect(screen.getByText('My Training')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('A test training run')).toBeInTheDocument();
  });

  it('renders "-" for metrics when there are no epochs', () => {
    render(<TrainingOverviewCard training={baseTraining} epochs={[]} />);
    expect(screen.getByText('0')).toBeInTheDocument(); // epoch count
    expect(screen.queryByText(/Latest Performance/)).not.toBeInTheDocument();
  });

  it('renders latest epoch metrics and cost estimate when epochs are present', () => {
    const epochs = [makeEpoch(1), makeEpoch(2)];
    render(<TrainingOverviewCard training={baseTraining} epochs={epochs} />);
    expect(screen.getByText('Latest Performance (Epoch 2)')).toBeInTheDocument();
    expect(screen.getByText('0.500')).toBeInTheDocument(); // train loss
    expect(screen.getByText(/Est\. Cost/)).toBeInTheDocument();
  });

  it('shows fallback for missing training uuid and dataset id', () => {
    const training = { ...baseTraining, training_uuid: undefined, uuid: undefined, datasetId: undefined };
    render(<TrainingOverviewCard training={training as unknown as Training} epochs={[]} />);
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it.each(['running', 'failed', 'pending', 'stalled'] as const)('renders %s status chip', (status) => {
    render(<TrainingOverviewCard training={{ ...baseTraining, status }} epochs={[]} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });
});

 it('links the downloaded Visin dataset and shows its pinned revision', () => {
    render(<TrainingOverviewCard training={{ ...baseTraining, dataset: { source: 'visin', id: 'd1', name: 'ZOD', revision: 'archive-version' } }} epochs={[]} />);
    expect(screen.getByRole('link', { name: 'ZOD' })).toHaveAttribute('href', '/datasets/d1');
    expect(screen.getByText('Revision: archive-version')).toBeInTheDocument();
  });

describe('TrainingOverviewCard Hub models', () => {
  const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
  const model = { _id: 'm1', provider: 'hf' as const, kind: 'model' as const, repo: 'acme/clftv2-zod', revision: COMMIT, addedAt: '2026-01-02T00:00:00.000Z' };

  it('shows no model line for a run without one', () => {
    render(<TrainingOverviewCard training={baseTraining} epochs={[]} />);
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
  });

  it('links the repo at its pinned commit, in a new tab', () => {
    render(<TrainingOverviewCard training={{ ...baseTraining, models: [model] }} epochs={[]} />);
    const link = screen.getByRole('link', { name: 'acme/clftv2-zod @ 3f2a1c9' });
    expect(link).toHaveAttribute('href', `https://huggingface.co/acme/clftv2-zod/tree/${COMMIT}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText('Model')).toBeInTheDocument();
  });

  it('lists every linked model with its file and epoch', () => {
    const second = { ...model, _id: 'm2', repo: 'acme/other', path: 'onnx/model.onnx', epoch: 12 };
    render(<TrainingOverviewCard training={{ ...baseTraining, models: [model, second] }} epochs={[]} />);
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /@ 3f2a1c9/ })).toHaveLength(2);
    expect(screen.getByText('onnx/model.onnx · epoch 12')).toBeInTheDocument();
  });
});

describe('TrainingOverviewCard model card', () => {
  const model = { _id: 'm1', provider: 'hf' as const, kind: 'model' as const, repo: 'acme/clft', revision: '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433', epoch: 7, addedAt: '2026-01-02T00:00:00.000Z' };

  it('opens the card Visin wrote for that model, for copying into the repo', async () => {
    const card = vi.spyOn(modelService, 'card').mockResolvedValue('---\ntags:\n  - visin\n---\n# clft');
    renderWithClient(<TrainingOverviewCard training={{ ...baseTraining, models: [model] }} epochs={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Model card' }));
    expect(await screen.findByLabelText('Model card')).toHaveTextContent('# clft');
    expect(card).toHaveBeenCalledWith('t1', { repo: 'acme/clft', epoch: 7 });
    expect(screen.getByRole('dialog', { name: 'Model card for acme/clft' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows how to try the model, pinned to its commit', () => {
    renderWithClient(<TrainingOverviewCard training={{ ...baseTraining, models: [model] }} epochs={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }));
    expect(screen.getByRole('dialog', { name: 'Try acme/clft' })).toBeInTheDocument();
    expect(screen.getByText(/--checkpoint hf:\/\/acme\/clft@3f2a1c9/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links straight to the demo Space once one is linked', () => {
    renderWithClient(<TrainingOverviewCard training={{ ...baseTraining, models: [{ ...model, space: 'acme/clft-demo' }] }} epochs={[]} />);
    expect(screen.getByRole('link', { name: 'Open demo' })).toHaveAttribute('href', 'https://huggingface.co/spaces/acme/clft-demo');
  });
});
