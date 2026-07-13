import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it.each(['running', 'failed', 'pending'] as const)('renders %s status chip', (status) => {
    render(<TrainingOverviewCard training={{ ...baseTraining, status }} epochs={[]} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });
});
