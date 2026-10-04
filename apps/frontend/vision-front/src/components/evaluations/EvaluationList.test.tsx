import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../services/evaluationService', () => ({ evaluationService: service }));
const layout = vi.hoisted(() => ({ compact: false }));
vi.mock('@visin/frontend-core', async importOriginal => ({
  ...(await importOriginal<typeof import('@visin/frontend-core')>()),
  useCompactLayout: () => layout.compact
}));

import EvaluationList from './EvaluationList';
import { renderWithClient } from '../../test/renderWithClient';
import type { Evaluation } from '../../types/evaluation';

const row = (id: string, overrides: Partial<Evaluation> = {}): Evaluation => ({
  _id: id,
  uuid: `u-${id}`,
  projectId: 'p1',
  ownerId: 'o1',
  checkpoint: { kind: 'local', sha256: 'a'.repeat(64), label: `Model ${id}` },
  suite: { id: 's1', slug: 'road-test', version: 1, digest: 'd'.repeat(64) },
  status: 'completed',
  receivedAt: '2026-10-01T09:00:00.000Z',
  validation: { version: 1, state: 'eligible', reasons: [], warnings: [] },
  createdAt: '2026-10-01T09:00:00.000Z',
  ...overrides
});
const page = (evaluations: Evaluation[], total = evaluations.length) => ({ evaluations, pagination: { page: 1, limit: 30, total, pages: 1 } });

describe('EvaluationList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    layout.compact = false;
  });

  it('lists each evaluation with its checkpoint, suite and verdict, each leading to its detail', async () => {
    service.list.mockResolvedValue(page([
      row('1'),
      row('2', { suite: undefined, validation: { version: 1, state: 'exploratory', reasons: [{ code: 'no-suite' }], warnings: [] } }),
      row('3', { status: 'failed', validation: { version: 1, state: 'incomplete', reasons: [{ code: 'evaluation-failed' }], warnings: [] } })
    ]));
    renderWithClient(<EvaluationList />);
    expect(await screen.findByRole('link', { name: 'Model 1' })).toHaveAttribute('href', '/evaluations/1');
    expect(screen.getAllByRole('link', { name: 'road-test@1' })[0]).toHaveAttribute('href', '/suites/road-test/1');
    expect(screen.getByText('Ranked')).toBeInTheDocument();
    expect(screen.getByText('Exploratory')).toBeInTheDocument();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByText('Run failed')).toBeInTheDocument();
    expect(service.list).toHaveBeenCalledWith({ page: 1, limit: 30 });
  });

  it('marks a result a manager put on the public leaderboard, and no other', async () => {
    service.list.mockResolvedValue(page([row('1', { publishedAt: '2026-10-02T09:00:00.000Z' }), row('2')]));
    renderWithClient(<EvaluationList />);
    await screen.findByRole('link', { name: 'Model 1' });
    expect(screen.getAllByText('Public')).toHaveLength(1);
  });

  it('asks for one project and one suite when told to, and shows a title', async () => {
    service.list.mockResolvedValue(page([row('1')]));
    renderWithClient(<EvaluationList projectId="p1" suite="road-test@1" title="Evaluations" />);
    await screen.findByRole('link', { name: 'Model 1' });
    expect(screen.getByRole('heading', { name: 'Evaluations' })).toBeInTheDocument();
    expect(service.list).toHaveBeenCalledWith({ projectId: 'p1', suite: 'road-test@1', page: 1, limit: 30 });
  });

  it('filters by verdict, returning to the first page', async () => {
    service.list.mockResolvedValue(page([row('1')]));
    renderWithClient(<EvaluationList />);
    await screen.findByRole('link', { name: 'Model 1' });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Verdict' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Incompatible' }));
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith({ state: 'incompatible', page: 1, limit: 30 }));
  });

  it('says what an evaluation is when there are none, and that a filter matched nothing when one is set', async () => {
    service.list.mockResolvedValue(page([]));
    renderWithClient(<EvaluationList />);
    expect(await screen.findByText('No evaluations yet')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Verdict' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Ranked' }));
    expect(await screen.findByText('No evaluations in this state')).toBeInTheDocument();
  });

  it('shows why it failed to load', async () => {
    service.list.mockRejectedValue(new Error('Access denied to project'));
    renderWithClient(<EvaluationList projectId="p1" />);
    expect(await screen.findByText('Access denied to project')).toBeInTheDocument();
  });

  it('pages when there is more than a page', async () => {
    service.list.mockResolvedValue(page([row('1')], 45));
    renderWithClient(<EvaluationList />);
    await screen.findByRole('link', { name: 'Model 1' });
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith({ page: 2, limit: 30 }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /rows per page/i }));
    fireEvent.click(await screen.findByRole('option', { name: '10' }));
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith({ page: 1, limit: 10 }));
  });

  it('is a list of rows on a phone', async () => {
    layout.compact = true;
    service.list.mockResolvedValue(page([row('1')]));
    renderWithClient(<EvaluationList />);
    expect(await screen.findByRole('link', { name: /Model 1/ })).toHaveAttribute('href', '/evaluations/1');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
