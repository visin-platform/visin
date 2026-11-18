import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const charts = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@mui/x-charts', () => ({
  LineChart: (props: Record<string, unknown>) => {
    charts.props.push(props);
    return <div data-testid="line-chart" />;
  }
}));

import InferenceRunOverview from './InferenceRunOverview';
import type { Epoch } from '../../types/epoch';
import type { Training } from '../../types/training';

const NOW = Date.UTC(2026, 10, 18, 3, 0);
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 18, 0, minutes)).toISOString();

const run = (overrides: Partial<Training> = {}): Training => ({
  _id: 'run',
  uuid: 'qwen-run',
  name: 'Qwen judge',
  kind: 'inference',
  status: 'running',
  suite: { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) },
  progress: { done: 200, total: 1000, unit: 'frame' },
  createdAt: at(0),
  updatedAt: at(60),
  ...overrides
});

const point = (epoch: number, minutes: number, results: Record<string, unknown>): Epoch =>
  ({ _id: `p${epoch}`, trainingId: 'run', training_uuid: 'qwen-run', epoch_uuid: `p${epoch}`, epoch, timestamp: at(minutes), results, createdAt: at(minutes), updatedAt: at(minutes) }) as Epoch;

const show = (training: Training, epochs: Epoch[] = []) => {
  charts.props.length = 0;
  return render(
    <MemoryRouter>
      <InferenceRunOverview training={training} epochs={epochs} now={NOW} />
    </MemoryRouter>
  );
};

describe('InferenceRunOverview', () => {
  it('shows frames done, the pace and time left, and links the suite and its judge comparison', () => {
    show(run(), [
      point(100, 0, { degenerate_rate: 0.02, reject_rate: { first: 0.1 }, latency_ms: 3000 }),
      point(200, 60, { degenerate_rate: 0.04, reject_rate: { first: 0.2 }, latency_ms: 4000 })
    ]);
    expect(screen.getByRole('progressbar', { name: 'Frames done' })).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByText(/200 \/ 1,000 frames \(20\.0%\)/)).toBeInTheDocument();
    expect(screen.getByText('100 frames per hour · about 8 h left at this pace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'zod-sam-verification@1' })).toHaveAttribute('href', '/suites/zod-sam-verification/1');
    expect(screen.getByRole('link', { name: 'Compare judges' })).toHaveAttribute('href', '/suites/zod-sam-verification/1/judges');
  });

  it('draws rates and latency on separate charts, rates in percent, and labels the axis by frames', () => {
    show(run(), [
      point(100, 0, { degenerate_rate: 0.02, reject_rate: { first: 0.1 } }),
      point(200, 60, { degenerate_rate: 0.04, reject_rate: { first: 0.2 }, latency_ms: 4000 })
    ]);
    expect(screen.getByText('Running rates')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(charts.props).toHaveLength(2);
    const [rates, latency] = charts.props as { xAxis: { label: string; data: number[] }[]; yAxis: { label: string }[]; series: { label: string; data: (number | null)[] }[] }[];
    expect(rates.xAxis[0]).toMatchObject({ label: 'Frames done', data: [100, 200] });
    expect(rates.yAxis[0].label).toBe('Share (%)');
    expect(rates.series.map((series) => series.label)).toEqual(['Degenerate rate', 'Reject rate · first']);
    expect(rates.series[0].data).toEqual([2, 4]);
    expect(latency.yAxis[0].label).toBe('Milliseconds');
    // The first point did not report latency: a gap, never a zero.
    expect(latency.series[0].data).toEqual([null, 4000]);
  });

  it('warns about a stalled run and waits for a second point before giving a pace', () => {
    show(run({ status: 'stalled', lastSeenAt: at(60) }), [point(100, 0, {})]);
    expect(screen.getByText(/Nothing heard from this run for 2 h/)).toBeInTheDocument();
    expect(screen.getByText('The pace shows once the run has reported progress twice.')).toBeInTheDocument();
    expect(screen.getByText(/No running metrics yet/)).toBeInTheDocument();
  });

  it('gives no time left for a finished run and says when a run never reported its size', () => {
    const finished = show(run({ status: 'completed', progress: { done: 1000, total: 1000, unit: 'frame' } }), [point(500, 0, {}), point(1000, 60, {})]);
    expect(screen.getByText('500 frames per hour')).toBeInTheDocument();
    finished.unmount();
    show(run({ progress: undefined, suite: undefined }));
    expect(screen.getByText('This run has not reported how many frames it will judge.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Compare judges' })).not.toBeInTheDocument();
  });

  it('charts each plain value on its own', () => {
    show(run(), [point(100, 0, { tokens: 3, prompts: 4 })]);
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.getByText('Prompts')).toBeInTheDocument();
    expect(charts.props).toHaveLength(2);
  });
});
