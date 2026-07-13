import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainingHardwareTab from './TrainingHardwareTab';
import type { Epoch } from '../types';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error test polyfill
  global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;
});

const makeEpoch = (epoch: number, results: Epoch['results']): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'uuid1',
  epoch_uuid: `epoch-${epoch}`,
  epoch,
  timestamp: '2024-01-01T00:00:00Z',
  results,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
});

describe('TrainingHardwareTab', () => {
  it('shows a message when there are no epochs', () => {
    render(<TrainingHardwareTab epochs={[]} />);
    expect(screen.getByText('No epochs available to display hardware metrics.')).toBeInTheDocument();
  });

  it('shows a message when epochs have no hardware/system data', () => {
    const epochs = [makeEpoch(1, { train: { loss: 0.5 } })];
    render(<TrainingHardwareTab epochs={epochs} />);
    expect(screen.getByText('No hardware metrics data available in the epochs.')).toBeInTheDocument();
  });

  it('renders GPU metrics chart when gpu data is present', () => {
    const epochs = [
      makeEpoch(1, {
        system: { gpu: { gpu_util: 50, memory_util: 40, temperature: 60 } }
      } as any)
    ];
    render(<TrainingHardwareTab epochs={epochs} />);
    expect(screen.getByText('GPU Metrics Over Epochs')).toBeInTheDocument();
  });

  it('renders GPU memory usage chart when memory data is present', () => {
    const epochs = [
      makeEpoch(1, {
        system: { gpu: { memory_used: 2048, memory_total: 8192 } }
      } as any)
    ];
    render(<TrainingHardwareTab epochs={epochs} />);
    expect(screen.getByText('GPU Memory Usage Over Epochs')).toBeInTheDocument();
  });

  it('renders CPU and system memory chart when cpu data is present', () => {
    const epochs = [
      makeEpoch(1, {
        system: { cpu: { percent: 30, memory_used: 1024 ** 3, memory_total: 4 * 1024 ** 3, memory_percent: 25, freq_current: 2400 } }
      } as any)
    ];
    render(<TrainingHardwareTab epochs={epochs} />);
    expect(screen.getByText('CPU and System Memory Over Epochs')).toBeInTheDocument();
  });

  it('renders all three sections together when full hardware data is present', () => {
    const epochs = [
      makeEpoch(1, {
        system: {
          gpu: { gpu_util: 50, memory_util: 40, memory_used: 2048, memory_total: 8192, temperature: 60 },
          cpu: { percent: 30, memory_used: 1024 ** 3, memory_total: 4 * 1024 ** 3, memory_percent: 25, freq_current: 2400 }
        }
      } as any)
    ];
    render(<TrainingHardwareTab epochs={epochs} />);
    expect(screen.getByText('GPU Metrics Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('GPU Memory Usage Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('CPU and System Memory Over Epochs')).toBeInTheDocument();
  });
});
