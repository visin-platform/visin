import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import LossChart from './LossChart';
import type { Epoch } from '../types';

const lineChart = vi.hoisted(() => vi.fn((_props: { series: { data: (number | null)[] }[] }) => null));
vi.mock('@mui/x-charts/LineChart', () => ({ LineChart: lineChart }));

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

describe('LossChart gaps', () => {
  it('leaves an epoch that did not report loss as a gap, not a drop to zero', () => {
    render(
      <LossChart
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
});
