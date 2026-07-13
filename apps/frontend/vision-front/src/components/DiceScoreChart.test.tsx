import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiceScoreChart from './DiceScoreChart';
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

describe('DiceScoreChart', () => {
  it('shows the empty message when there is no data', () => {
    render(<DiceScoreChart epochs={[]} />);
    expect(screen.getByText('No dice score data available for this training')).toBeInTheDocument();
  });

  it('shows the empty message when epochs have zero-valued dice score', () => {
    const epochs = [makeEpoch(1, { train: { dice_score: 0 }, val: { dice_score: 0 } })];
    render(<DiceScoreChart epochs={epochs} />);
    expect(screen.getByText('No dice score data available for this training')).toBeInTheDocument();
  });

  it('renders a chart when dice score data is present', () => {
    const epochs = [
      makeEpoch(1, { train: { dice_score: 0.6 }, val: { dice_score: 0.55 } }),
      makeEpoch(2, { train: { dice_score: 0.8 }, val: { dice_score: 0.75 } })
    ];
    const { container } = render(<DiceScoreChart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Training and Validation Dice Score')).toBeInTheDocument();
  });
});
