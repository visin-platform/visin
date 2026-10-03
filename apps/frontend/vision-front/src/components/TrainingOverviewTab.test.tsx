import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TrainingOverviewTab from './TrainingOverviewTab';
import { Training, Epoch } from '../types';

vi.mock('@mui/x-charts', () => ({
  LineChart: () => <div data-testid="line-chart" />
}));
vi.mock('../components/ClassIoUOverEpochsChart', () => ({ default: () => <div data-testid="class-iou-chart" /> }));
vi.mock('../components/LossChart', () => ({ default: () => <div data-testid="loss-chart" /> }));
vi.mock('../components/MIoUChart', () => ({ default: () => <div data-testid="miou-chart" /> }));
vi.mock('../components/PixelAccuracyChart', () => ({ default: () => <div data-testid="pixel-accuracy-chart" /> }));
vi.mock('../components/MeanAccuracyChart', () => ({ default: () => <div data-testid="mean-accuracy-chart" /> }));
vi.mock('../components/DiceScoreChart', () => ({ default: () => <div data-testid="dice-score-chart" /> }));
vi.mock('../components/TrainingTimeMetrics', () => ({ default: () => <div data-testid="training-time-metrics" /> }));
vi.mock('../components/TrainingOverviewCard', () => ({ default: () => <div data-testid="training-overview-card" /> }));
vi.mock('../components/ClassPrecisionChart', () => ({ default: () => <div data-testid="class-precision-chart" /> }));
vi.mock('../components/ClassRecallChart', () => ({ default: () => <div data-testid="class-recall-chart" /> }));
vi.mock('../components/ClassF1Chart', () => ({ default: () => <div data-testid="class-f1-chart" /> }));

const training: Training = {
  _id: 't1',
  uuid: 'uuid-1',
  name: 'My Training',
  status: 'completed',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z'
};

const makeEpoch = (epoch: number, overrides: Partial<Epoch> = {}): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'training-uuid-1',
  epoch_uuid: `epoch-uuid-${epoch}`,
  epoch,
  timestamp: '2026-01-01T10:00:00.000Z',
  results: {},
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  ...overrides
});

describe('TrainingOverviewTab', () => {
  it('lets a writer add a note, which is saved through the page', async () => {
    const onSaveNotes = vi.fn().mockResolvedValue(undefined);
    render(<TrainingOverviewTab training={training} epochs={[makeEpoch(1)]} canEdit onSaveNotes={onSaveNotes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'seed 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaveNotes).toHaveBeenCalledWith('seed 2'));
  });

  it('shows no notes card to a reader of a run without one, and the note to a reader of one with', () => {
    const { rerender } = render(<TrainingOverviewTab training={training} epochs={[makeEpoch(1)]} />);
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    rerender(<TrainingOverviewTab training={{ ...training, notes: 'night set' }} epochs={[makeEpoch(1)]} />);
    expect(screen.getByText('night set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows what the run was started from only when the client recorded it', () => {
    const { rerender } = render(<TrainingOverviewTab training={training} epochs={[makeEpoch(1)]} />);
    expect(screen.queryByText('Reproducibility')).not.toBeInTheDocument();
    rerender(<TrainingOverviewTab training={{ ...training, provenance: { git: { commit: 'a1b2c3d4e5f6' } } }} epochs={[makeEpoch(1)]} />);
    expect(screen.getByText('Reproducibility')).toBeInTheDocument();
  });

  it('renders the core metric charts and overview card', () => {
    render(<TrainingOverviewTab training={training} epochs={[makeEpoch(1)]} />);
    expect(screen.getByTestId('training-overview-card')).toBeInTheDocument();
    expect(screen.getByText('Loss Metrics')).toBeInTheDocument();
    expect(screen.getByText('Mean IoU')).toBeInTheDocument();
    expect(screen.getByText('Class IoU Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('Class Precision Scores')).toBeInTheDocument();
    expect(screen.getByText('Class Recall Scores')).toBeInTheDocument();
    expect(screen.getByText('Class F1 Scores')).toBeInTheDocument();
    expect(screen.getByText('Pixel Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Mean Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Dice Score')).toBeInTheDocument();
    expect(screen.getByTestId('training-time-metrics')).toBeInTheDocument();
  });

  it('does not render the standard training IoU chart when data is absent', () => {
    render(<TrainingOverviewTab training={training} epochs={[makeEpoch(1)]} />);
    expect(screen.queryByText('Standard Training IoU Over Epochs')).not.toBeInTheDocument();
  });

  it('renders the standard training IoU chart when train_standard/val_standard data is present', () => {
    const epochs = [
      makeEpoch(1, { results: { train_standard: { mean_iou: 0.5 }, val_standard: { mean_iou: 0.4 } } as any })
    ];
    render(<TrainingOverviewTab training={training} epochs={epochs} />);
    expect(screen.getByText('Standard Training IoU Over Epochs')).toBeInTheDocument();
  });

  it('does not render the per-class metrics table when no per_class data is present', () => {
    render(<TrainingOverviewTab training={training} epochs={[makeEpoch(1)]} />);
    expect(screen.queryByText('Per-Class Validation Metrics (Latest Epoch)')).not.toBeInTheDocument();
  });

  it('renders the per-class metrics table from the last epoch when per_class data is present', () => {
    const epochs = [
      makeEpoch(1),
      makeEpoch(2, {
        results: {
          metrics: {
            per_class: {
              car: { iou: 0.8, precision: 0.9, recall: 0.7, f1: 0.75 }
            }
          }
        } as any
      })
    ];
    render(<TrainingOverviewTab training={training} epochs={epochs} />);
    expect(screen.getByText('Per-Class Validation Metrics (Latest Epoch)')).toBeInTheDocument();
    expect(screen.getByText('car')).toBeInTheDocument();
    expect(screen.getByText('0.8000')).toBeInTheDocument();
  });

  it('handles an empty epochs array without crashing', () => {
    render(<TrainingOverviewTab training={training} epochs={[]} />);
    expect(screen.getByText('Loss Metrics')).toBeInTheDocument();
  });
});
