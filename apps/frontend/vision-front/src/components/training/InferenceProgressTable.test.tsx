import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import InferenceProgressTable from './InferenceProgressTable';
import type { Epoch } from '../../types/epoch';

const point = (done: number, results: Record<string, unknown>): Epoch =>
  ({
    _id: `p${done}`,
    trainingId: 'r',
    training_uuid: 'u',
    epoch_uuid: `e${done}`,
    epoch: done,
    timestamp: new Date(Date.UTC(2026, 7, 4, 17, done)).toISOString(),
    results,
    metadata: { frame: `frame_${String(done).padStart(6, '0')}` },
    createdAt: '',
    updatedAt: ''
  }) as Epoch;

describe('InferenceProgressTable', () => {
  it('shows each point with its frame and the values it reported, a page at a time', () => {
    const epochs = Array.from({ length: 120 }, (_, index) =>
      point(index + 1, { reject_rate: { sign: 0.1 + index / 1000 }, latency_ms: 9000 + index, frame_seconds: 12.5, ...(index === 0 ? {} : { degenerate_rate: 0.02 }) })
    );
    render(<InferenceProgressTable epochs={epochs} />);
    const table = screen.getByRole('table', { name: 'Progress points' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    const first = within(table).getAllByRole('row')[1];
    expect(first).toHaveTextContent('frame_000001');
    expect(first).toHaveTextContent('10.0%');
    expect(first).toHaveTextContent('9,000 ms');
    // A value the point did not report is a dash, never a zero.
    expect(within(first).getAllByRole('cell').some((cell) => cell.textContent === '-')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('frame_000051');
  });

  it('says so when there are no points', () => {
    render(<InferenceProgressTable epochs={[]} />);
    expect(screen.getByText('No progress points yet.')).toBeInTheDocument();
  });
});
