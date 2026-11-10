import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Training } from '../../types';
import { StatusChip } from './TrainingStatusChip';

const run = (patch: Partial<Training> = {}): Training =>
  ({ _id: 't1', uuid: 'u1', name: 'baseline', status: 'completed', createdAt: '', updatedAt: '', ...patch }) as Training;
const metrics = (epochCount: number) => ({
  totalTime: 100,
  epochCount,
  maxEpoch: epochCount,
  lastEpochTimestamp: null,
  cpuCost: 0,
  gpuCost: 0,
  totalCost: 0
});

describe('StatusChip', () => {
  it('shows a run that is training with a pulsing dot and how far it has got', () => {
    render(<StatusChip training={run({ status: 'running', metrics: metrics(17) })} />);
    expect(screen.getByText('running · epoch 17')).toBeInTheDocument();
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
  });

  it('says only "running" before the first epoch, and still shows it is live', () => {
    render(<StatusChip training={run({ status: 'running', metrics: metrics(0) })} />);
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
    expect(screen.queryByText(/epoch/)).not.toBeInTheDocument();
  });

  it.each(['completed', 'failed', 'pending'] as const)('has no live dot for a run that is %s', (status) => {
    render(<StatusChip training={run({ status, metrics: metrics(5) })} />);
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument();
  });

  it('says how long a stalled run has been quiet, with no live dot', () => {
    render(<StatusChip training={run({ status: 'stalled', lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString() })} />);
    expect(screen.getByText(/stalled — last heard 5 min ago/)).toBeInTheDocument();
    expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument();
  });
});
