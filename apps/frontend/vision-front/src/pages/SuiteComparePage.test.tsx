import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';

const services = vi.hoisted(() => ({ suite: { get: vi.fn() }, evaluation: { get: vi.fn() } }));
vi.mock('../services/evaluationService', () => ({ suiteService: services.suite, evaluationService: services.evaluation }));

import SuiteComparePage from './SuiteComparePage';
import { renderWithClient } from '../test/renderWithClient';
import type { Evaluation, Suite } from '../types/evaluation';

const DIGEST = 'ab'.repeat(32);
const suite = (): Suite => ({
  _id: 's1', slug: 'road-test', version: 1, name: 'Road scenes', projectId: 'p1', visibility: 'public', submissions: 'open', createdBy: 'u1', digest: DIGEST, createdAt: '', updatedAt: '',
  protocol: {
    task: 'seg', data: { kind: 'external', label: 'x', manifestSha256: 'a'.repeat(64) }, split: 'test',
    conditions: [{ name: 'day', sampleCount: 10 }, { name: 'night', sampleCount: 5 }], classes: [], ignoredClasses: [],
    metrics: [{ key: 'mIoU', direction: 'max', headline: true }, { key: 'latency', direction: 'min', unit: 'ms' }],
    aggregation: 'pooled', input: {}, evaluator: { package: 'p' }
  }
});
const scores = (day: number, night: number, overall: number, latency = [10, 12, 11]) => ({
  conditions: { day: { mIoU: day, latency: latency[0] }, night: { mIoU: night, latency: latency[1] } },
  overall: { mIoU: overall, latency: latency[2] }
});
const evaluation = (id: string, label: string, result?: ReturnType<typeof scores>, over: Partial<Evaluation> = {}): Evaluation => ({
  _id: id, uuid: id, projectId: 'p1', ownerId: 'o', status: 'completed', receivedAt: '', createdAt: '',
  checkpoint: { kind: 'local', sha256: 'a'.repeat(64), label },
  suite: { id: 's1', slug: 'road-test', version: 1, digest: DIGEST },
  validation: { version: 2, state: result ? 'eligible' : 'incomplete', evidence: 'observed', reasons: [], warnings: [], ...(result ? { scores: result } : {}) },
  ...over
});

const renderCompare = (query = 'a=e1&b=e2') =>
  renderWithClient(<SuiteComparePage />, { path: `/suites/road-test/1/compare?${query}`, route: '/suites/:slug/:version/compare' });

describe('SuiteComparePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    services.suite.get.mockResolvedValue(suite());
    services.evaluation.get.mockImplementation(async (id: string) =>
      id === 'e1' ? evaluation('e1', 'Model A', scores(0.8, 0.6, 0.7)) : evaluation('e2', 'Model B', scores(0.82, 0.55, 0.7))
    );
  });

  it('shows the overall figure and each condition, with the change and who is better, from the ranked scores', async () => {
    renderCompare();
    const table = within(await screen.findByRole('table', { name: 'Comparison' }));
    const rows = table.getAllByRole('row').slice(1);
    expect(rows.map(row => Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent))).toEqual([
      ['Overall', '0.7000', '0.7000', '0.0000', 'Same'],
      ['day', '0.8000', '0.8200', '+0.0200', 'Better'],
      ['night', '0.6000', '0.5500', '-0.0500', 'Worse']
    ]);
    expect(services.suite.get).toHaveBeenCalledWith('road-test', '1');
    expect(services.evaluation.get).toHaveBeenCalledWith('e1');
    expect(screen.getByText(/Compared on mIoU, higher is better/)).toBeInTheDocument();
    expect(screen.getByText(/The first has a score in 2, the second in 2/)).toBeInTheDocument();
  });

  it('links each checkpoint to its evidence and says how much each reported', async () => {
    renderCompare();
    expect(await screen.findByRole('link', { name: 'Model A' })).toHaveAttribute('href', '/evaluations/e1');
    expect(screen.getByRole('link', { name: 'Model B' })).toHaveAttribute('href', '/evaluations/e2');
    expect(screen.getAllByText('Evidence: observed')).toHaveLength(2);
  });

  it('shows a condition one side has no score in as missing, not as a zero', async () => {
    const thin = scores(0.8, 0.6, 0.7);
    delete (thin.conditions as Record<string, unknown>).night;
    services.evaluation.get.mockImplementation(async (id: string) => (id === 'e1' ? evaluation('e1', 'Model A', scores(0.8, 0.6, 0.7)) : evaluation('e2', 'Model B', thin)));
    renderCompare();
    const rows = within(await screen.findByRole('table', { name: 'Comparison' })).getAllByRole('row').slice(1);
    expect(Array.from(rows[2].querySelectorAll('th, td')).map(cell => cell.textContent)).toEqual(['night', '0.6000', '—', '—', 'Missing']);
    expect(screen.getByText(/the second in 1/)).toBeInTheDocument();
  });

  it('reads a lower-is-better metric the other way round when it is chosen, and swaps the two', async () => {
    renderCompare();
    await screen.findByRole('table', { name: 'Comparison' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Metric' }));
    await userEvent.click(await screen.findByRole('option', { name: 'latency' }));
    await waitFor(() => expect(screen.getByText(/Compared on latency \(ms\), lower is better/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Swap' }));
    await waitFor(() => expect(services.evaluation.get).toHaveBeenCalledWith('e2'));
    const links = screen.getAllByRole('link').filter(link => /Model [AB]/.test(link.textContent ?? '')).map(link => link.textContent);
    expect(links).toEqual(['Model B', 'Model A']);
  });

  it('says an evaluation that is not ranked has nothing to compare', async () => {
    services.evaluation.get.mockImplementation(async (id: string) => (id === 'e1' ? evaluation('e1', 'Model A', scores(0.8, 0.6, 0.7)) : evaluation('e2', 'Model B')));
    renderCompare();
    expect(await screen.findByText('The second checkpoint is incomplete, so it has no ranked scores to compare.')).toBeInTheDocument();
    expect(screen.getAllByText('Missing')).toHaveLength(3);
  });

  it('refuses two results from different suite versions', async () => {
    services.evaluation.get.mockImplementation(async (id: string) =>
      id === 'e1' ? evaluation('e1', 'Model A', scores(0.8, 0.6, 0.7)) : evaluation('e2', 'Model B', scores(0.8, 0.6, 0.7), { suite: { id: 's2', slug: 'road-test', version: 2, digest: DIGEST } })
    );
    renderCompare();
    expect(await screen.findByText(/second checkpoint is on road-test@2, not road-test@1/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Comparison' })).not.toBeInTheDocument();
  });

  it('asks for two different checkpoints when the link names fewer, or the same twice', async () => {
    const { unmount } = renderCompare('a=e1');
    expect(await screen.findByText(/Pick two different checkpoints/)).toBeInTheDocument();
    unmount();
    renderCompare('a=e1&b=e1');
    expect(await screen.findByText(/Pick two different checkpoints/)).toBeInTheDocument();
    expect(services.evaluation.get).not.toHaveBeenCalled();
    expect(services.suite.get).not.toHaveBeenCalled();
  });

  it('shows the server\'s answer when a result cannot be read', async () => {
    services.evaluation.get.mockRejectedValue(new Error('Evaluation not found'));
    renderCompare();
    expect(await screen.findByText('Evaluation not found')).toBeInTheDocument();
  });
});
