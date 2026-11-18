import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const service = vi.hoisted(() => ({
  list: vi.fn(), reference: vi.fn(), compareJudges: vi.fn(), judgeDisagreements: vi.fn(), getSuite: vi.fn(), listDatasets: vi.fn(), listItems: vi.fn()
}));
vi.mock('../../services/evaluationService', () => ({
  evaluationService: { list: service.list, reference: service.reference, compareJudges: service.compareJudges, judgeDisagreements: service.judgeDisagreements },
  suiteService: { get: service.getSuite }
}));
vi.mock('../../services/datasetService', () => ({ listDatasets: service.listDatasets, listItems: service.listItems }));

import RunAuditTab from './RunAuditTab';
import { renderWithClient } from '../../test/renderWithClient';

const pinned = { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) };
const model = {
  _id: 'm1', status: 'completed', samplesDigest: 'a'.repeat(64), checkpoint: { kind: 'local', label: 'qwen2.5vl:72b (Q4_K_M)', sha256: 'b'.repeat(64) },
  results: { overall: { overall: {}, sign: { false_accept: 0.512, false_reject: 0.241 } } }
};
const human = { _id: 'h1', status: 'completed', samplesDigest: 'c'.repeat(64), checkpoint: { kind: 'human', label: 'annotator_1' } };
const group = (groupBy: string, value: string | undefined, count: number, agreement: number) => ({
  groupBy, ...(value ? { value } : {}), count, agreement, divergence: 1 - agreement, kappa: 0.4, binaryKappa: 0.41, weightedDivergence: null,
  matrix: [{ a: 'keep', b: 'keep', count: 70, weight: 0 }, { a: 'keep', b: 'delete', count: 20, weight: 0 }, { a: 'delete', b: 'delete', count: 10, weight: 0 }]
});
const pair = {
  evaluationA: 'm1', evaluationB: 'h1', suite: pinned, referenceEvaluationId: 'h1',
  fields: [{ field: 'outcome', groups: [group('overall', undefined, 100, 0.8), group('class', 'sign', 100, 0.8), group('size', '<250', 100, 0.8)] }]
};

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockResolvedValue({ evaluations: [model], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
  service.reference.mockResolvedValue(human);
  service.compareJudges.mockResolvedValue(pair);
  service.getSuite.mockResolvedValue({ protocol: { classes: [{ id: 'sign' }], conditions: [{ name: '<250' }], samples: { attrs: [], fields: [{ key: 'outcome', values: ['keep', 'delete'] }] } } });
  service.listDatasets.mockResolvedValue({ datasets: [], pagination: { page: 1, pages: 1 } });
  service.judgeDisagreements.mockResolvedValue({
    field: 'outcome',
    samples: [{ id: 'frame_1/m1', attrs: { frame: 'frame_1' }, a: { fields: { outcome: 'keep' }, raw: 'sign' }, b: { fields: { outcome: 'delete' } } }],
    pagination: { page: 1, limit: 10, total: 1, pages: 1 }
  });
});

describe('RunAuditTab', () => {
  it('measures the run against the annotator and opens the decisions a transition holds', async () => {
    renderWithClient(<RunAuditTab training={{ _id: 'run1', suite: pinned }} />);
    expect(await screen.findByText(/100 of this run's decisions were audited by annotator_1/)).toBeInTheDocument();
    expect(service.compareJudges).toHaveBeenCalledWith('m1', 'h1');
    const byClass = screen.getByRole('table', { name: 'Audit by class' });
    expect(within(byClass).getByText('51.2%')).toBeInTheDocument();
    expect(within(byClass).getByText('24.1%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '20 decisions: model keep, annotator delete' }));
    await waitFor(() => expect(service.judgeDisagreements).toHaveBeenLastCalledWith('m1', 'h1', expect.objectContaining({ field: 'outcome', a: 'keep', b: 'delete' })));
    expect(await screen.findByText('Model:')).toBeInTheDocument();
    expect(screen.getByText('Annotator:')).toBeInTheDocument();
    // The annotator is the second side: neither a raw reply nor a second annotator line is shown for it.
    expect(screen.getAllByText('Annotator:')).toHaveLength(1);
    expect(screen.queryByText('Raw reply not recorded')).not.toBeInTheDocument();
  });

  it('says so for the annotator run itself, a run not yet scored, and a suite without a reference', async () => {
    service.list.mockResolvedValueOnce({ evaluations: [human], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
    const first = renderWithClient(<RunAuditTab training={{ _id: 'run1', suite: pinned }} />);
    expect(await screen.findByText(/This run is the annotator's audit/)).toBeInTheDocument();
    first.unmount();
    service.list.mockResolvedValueOnce({ evaluations: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    const second = renderWithClient(<RunAuditTab training={{ _id: 'run1', suite: pinned }} />);
    expect(await screen.findByText(/no completed sample evaluation/)).toBeInTheDocument();
    second.unmount();
    service.reference.mockRejectedValueOnce(new Error('This suite has no reference'));
    renderWithClient(<RunAuditTab training={{ _id: 'run1', suite: pinned }} />);
    expect(await screen.findByText(/no human reference you can read/)).toBeInTheDocument();
  });
});
