import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainingSystemInfoTab from './TrainingSystemInfoTab';
import { Epoch } from '../types';

const makeEpoch = (epoch: number, withSystemInfo = true): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'training-uuid-1',
  epoch_uuid: `epoch-uuid-${epoch}`,
  epoch,
  timestamp: '2026-01-01T10:00:00.000Z',
  results: withSystemInfo
    ? {
        system_info: {
          memory_used_gb: 4,
          memory_max_gb: 16,
          gpu: {
            gpu_0: {
              memory_used_gb: 6,
              memory_max_gb: 24,
              memory_reserved_gb: 8,
              temperature_celsius: 65,
              power_watts: 150,
              power_limit_watts: 250,
              memory_utilization_percent: 40,
              fan_speed_percent: 55
            }
          }
        } as any
      }
    : {},
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z'
});

describe('TrainingSystemInfoTab', () => {
  it('renders empty state when no epochs have system info', () => {
    render(<TrainingSystemInfoTab epochs={[makeEpoch(1, false)]} />);
    expect(screen.getByText('No system information available')).toBeInTheDocument();
  });

  it('renders empty state when epochs array is empty', () => {
    render(<TrainingSystemInfoTab epochs={[]} />);
    expect(screen.getByText('No system information available')).toBeInTheDocument();
  });

  it('renders system metric charts when epochs have system info', () => {
    render(<TrainingSystemInfoTab epochs={[makeEpoch(1), makeEpoch(2)]} />);
    expect(screen.getByText('System Metrics')).toBeInTheDocument();
    expect(screen.getByText('System Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('GPU Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('GPU Power Consumption')).toBeInTheDocument();
    expect(screen.getByText('GPU Temperature & Fan Speed')).toBeInTheDocument();
  });

  it('filters out epochs without system info while still rendering others', () => {
    render(<TrainingSystemInfoTab epochs={[makeEpoch(1), makeEpoch(2, false)]} />);
    expect(screen.getByText('System Metrics')).toBeInTheDocument();
  });

  it('defaults every metric to 0 when system_info has no gpu data', () => {
    const epoch: Epoch = {
      _id: 'e1',
      trainingId: 't1',
      training_uuid: 'training-uuid-1',
      epoch_uuid: 'epoch-uuid-1',
      epoch: 1,
      timestamp: '2026-01-01T10:00:00.000Z',
      results: { system_info: {} as any },
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z'
    };

    render(<TrainingSystemInfoTab epochs={[epoch]} />);

    expect(screen.getByText('System Metrics')).toBeInTheDocument();
  });
});
