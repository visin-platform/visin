import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainValChart from './TrainValChart';
import type { Epoch } from '../types';

const lineChart = vi.hoisted(() => vi.fn((_props: { series: { data: (number | null)[] }[] }) => null));
vi.mock('@mui/x-charts/LineChart', () => ({ LineChart: lineChart }));

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

const metrics = [
  { metric: 'loss', label: 'Loss' },
  { metric: 'mean_iou', label: 'MIoU' },
  { metric: 'mean_accuracy', label: 'Mean Accuracy' },
  { metric: 'pixel_accuracy', label: 'Pixel Accuracy' },
  { metric: 'dice_score', label: 'Dice Score' }
];

describe.each(metrics)('TrainValChart $metric', ({ metric, label }) => {
  const empty = `No ${label} data available for this training`;
  const chart = (epochs: Epoch[]) => <TrainValChart epochs={epochs} metric={metric} label={label} />;

  it('shows the empty message when there is no data', () => {
    render(chart([]));
    expect(screen.getByText(empty)).toBeInTheDocument();
  });

  it('shows the empty message when every epoch reports zero', () => {
    render(chart([makeEpoch(1, { train: { [metric]: 0 }, val: { [metric]: 0 } })]));
    expect(screen.getByText(empty)).toBeInTheDocument();
  });

  it('renders a titled chart when data is present', () => {
    render(
      chart([
        makeEpoch(1, { train: { [metric]: 0.9 }, val: { [metric]: 0.95 } }),
        makeEpoch(2, { train: { [metric]: 0.5 }, val: { [metric]: 0.55 } })
      ])
    );
    expect(screen.getByText(`Training and Validation ${label}`)).toBeInTheDocument();
    const { series } = lineChart.mock.calls.at(-1)![0] as unknown as { series: { label: string }[] };
    expect(series.map(s => s.label)).toEqual([`Training ${label}`, `Validation ${label}`]);
  });
});

describe('TrainValChart gaps and order', () => {
  it('leaves an epoch that did not report the metric as a gap, not a drop to zero', () => {
    render(
      <TrainValChart
        metric="loss"
        label="Loss"
        epochs={[
          makeEpoch(1, { train: { loss: 0.9 }, val: { loss: 0.95 } }),
          makeEpoch(2, { train: {}, val: { loss: 0.7 } }),
          makeEpoch(3, { train: { loss: 0.5 }, val: { loss: 0.55 } })
        ]}
      />
    );

    const [train, val] = lineChart.mock.calls.at(-1)![0].series;
    expect(train.data).toEqual([0.9, null, 0.5]);
    expect(val.data).toEqual([0.95, 0.7, 0.55]);
  });

  it('leaves a value that is not a finite number as a gap', () => {
    render(
      <TrainValChart
        metric="ap"
        label="AP"
        epochs={[
          makeEpoch(1, { train: { ap: 0.4 }, val: { ap: { mean: 0.42 } } } as unknown as Epoch['results']),
          makeEpoch(2, { train: { ap: 'n/a' }, val: { ap: Number.NaN } } as unknown as Epoch['results'])
        ]}
      />
    );

    const [train, val] = lineChart.mock.calls.at(-1)![0].series;
    expect(train.data).toEqual([0.4, null]);
    expect(val.data).toEqual([null, null]);
  });

  it('plots epochs in order even when they arrive shuffled', () => {
    render(
      <TrainValChart
        metric="loss"
        label="Loss"
        epochs={[
          makeEpoch(2, { train: { loss: 0.5 }, val: { loss: 0.55 } }),
          makeEpoch(1, { train: { loss: 0.9 }, val: { loss: 0.95 } })
        ]}
      />
    );

    const [train] = lineChart.mock.calls.at(-1)![0].series;
    expect(train.data).toEqual([0.9, 0.5]);
  });
});
