import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const services = vi.hoisted(() => ({ suite: { get: vi.fn() }, evaluation: { get: vi.fn(), list: vi.fn(), compareJudges: vi.fn(), judgeDisagreements: vi.fn() }, datasets: { listDatasets: vi.fn(), listItems: vi.fn() } }));
vi.mock('../services/evaluationService', () => ({ suiteService: services.suite, evaluationService: services.evaluation }));
vi.mock('../services/datasetService', () => services.datasets);

import JudgeComparePage from './JudgeComparePage';
import { renderWithClient } from '../test/renderWithClient';
import type { Evaluation, JudgePair, Suite } from '../types/evaluation';

const suite: Suite = {
  _id: 's1', slug: 'judges', version: 1, name: 'Judges', projectId: 'p1', visibility: 'private', submissions: 'open', createdBy: 'u', digest: 'digest', createdAt: '', updatedAt: '',
  protocol: {
    task: 'vlm-judge', data: { kind: 'external', label: 'frames', manifestSha256: 'a'.repeat(64) }, split: 'test',
    conditions: [{ name: 'small', sampleCount: 3 }], classes: [{ id: 'a' }], ignoredClasses: [],
    metrics: [{ key: 'reject', direction: 'min', headline: true }], aggregation: 'pooled', input: {}, evaluator: { package: 'p' },
    samples: { attrs: [{ key: 'pixels' }], fields: [{ key: 'outcome', values: ['keep', 'delete'], accept: ['keep'] }], weight: 'pixels' }
  }
};
const evaluation = (id: string, label: string, key: string): Evaluation => ({
  _id: id, uuid: id, projectId: 'p1', status: 'completed', receivedAt: '', createdAt: '', samplesDigest: 'digest', checkpointKey: key,
  checkpoint: { kind: 'local', label, sha256: 'a'.repeat(64) }, suite: { id: 's1', slug: 'judges', version: 1, digest: 'digest' },
  validation: { version: 2, state: 'eligible', reasons: [], warnings: [] }
});
const evaluations = [evaluation('e1', 'First model', 'model-a'), evaluation('e2', 'Second model', 'model-b'), evaluation('e3', 'First repeat', 'model-a')];
const pair: JudgePair = {
  evaluationA: 'e1', evaluationB: 'e2', suite: { slug: 'judges', version: 1, digest: 'digest' },
  fields: [{ field: 'outcome', groups: [
    { groupBy: 'overall', count: 3, agreement: 1 / 3, divergence: 2 / 3, kappa: -0.5, binaryKappa: -0.5, weightedDivergence: 0.5,
      matrix: [{ a: 'keep', b: 'delete', count: 1, weight: 100 }, { a: 'delete', b: 'keep', count: 1, weight: 200 }, { a: 'keep', b: 'keep', count: 1, weight: 300 }],
      reference: { total: 3, errorA: 2, errorB: 0, flips: 2, correctA: 0, correctB: 2, keepUnlessBothDeleteErrors: 1, reviewedErrors: 0, errorRateA: 2 / 3, errorRateB: 0, keepUnlessBothDeleteErrorRate: 1 / 3, reviewedErrorRate: 0 } },
    { groupBy: 'class', value: 'a', count: 3, agreement: 1 / 3, divergence: 2 / 3, kappa: -0.5, binaryKappa: -0.5, weightedDivergence: 0.5, matrix: [] },
    { groupBy: 'size', value: 'small', count: 3, agreement: 1 / 3, divergence: 2 / 3, kappa: -0.5, weightedDivergence: 0.5, matrix: [] }
  ] }]
};
const renderPage = (query = 'a=e1&b=e2') => renderWithClient(<JudgeComparePage />, { path: `/suites/judges/1/judges?${query}`, route: '/suites/:slug/:version/judges' });

describe('JudgeComparePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    services.suite.get.mockResolvedValue(suite);
    services.evaluation.get.mockImplementation(async (id: string) => evaluations.find(item => item._id === id));
    services.evaluation.list.mockResolvedValue({ evaluations, pagination: { page: 1, limit: 100, total: 3, pages: 1 } });
    services.evaluation.compareJudges.mockResolvedValue(pair);
    services.evaluation.judgeDisagreements.mockResolvedValue({ field: 'outcome', samples: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } });
    services.datasets.listDatasets.mockResolvedValue({ datasets: [], pagination: { page: 1, pages: 0 } });
  });

  it('shows transitions, class agreement, size divergence, annotator errors and an available repeat', async () => {
    renderPage();
    expect(await screen.findByRole('table', { name: 'outcome transitions' })).toBeInTheDocument();
    expect(screen.getByText(/agreement 33.3% · divergence 66.7%/)).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Kappa by class' })).getAllByText('-0.50')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Divergence by size' })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'outcome annotator comparison' })).getByText('66.7% (2)')).toBeInTheDocument();
    expect(await screen.findByText('Available repeat of First model')).toBeInTheDocument();
    await waitFor(() => expect(services.evaluation.compareJudges).toHaveBeenCalledWith('e1', 'e3'));
  });

  it('opens a transition cell as a filtered disagreement query', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '1 · browse outcome: keep to delete' }));
    await waitFor(() => expect(services.evaluation.judgeDisagreements).toHaveBeenCalledWith('e1', 'e2', expect.objectContaining({ field: 'outcome', a: 'keep', b: 'delete' })));
  });

  it('lets a reader select evaluations and explains a same-checkpoint comparison', async () => {
    renderPage('');
    expect(await screen.findByText(/Choose two completed sample evaluations/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'First evaluation' }));
    await userEvent.click(await screen.findByRole('option', { name: 'First model · e1' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Second evaluation' }));
    await userEvent.click(await screen.findByRole('option', { name: 'First repeat · e3' }));
    expect(await screen.findByText(/same checkpoint; this comparison measures variation/)).toBeInTheDocument();
    expect(services.evaluation.compareJudges).toHaveBeenCalledWith('e1', 'e3');
  });

  it('shows a repeat of the second model when the first has none', async () => {
    const repeatB = evaluation('e4', 'Second repeat', 'model-b');
    services.evaluation.list.mockResolvedValue({ evaluations: [evaluations[0], evaluations[1], repeatB], pagination: { page: 1, limit: 100, total: 3, pages: 1 } });
    renderPage();
    expect(await screen.findByText('Available repeat of Second model')).toBeInTheDocument();
    expect(services.evaluation.compareJudges).toHaveBeenCalledWith('e2', 'e4');
  });

  it('does not request a pair for the same evaluation or an evaluation on another suite', async () => {
    const result = renderPage('a=e1&b=e1');
    expect(await screen.findByText(/Choose two different evaluations/)).toBeInTheDocument();
    expect(services.evaluation.compareJudges).not.toHaveBeenCalled();
    result.unmount();
    services.evaluation.get.mockImplementation(async (id: string) => id === 'e2' ? { ...evaluations[1], suite: { ...evaluations[1].suite!, id: 'other' } } : evaluations[0]);
    renderPage();
    expect(await screen.findByText('Both evaluations must belong to this suite.')).toBeInTheDocument();
    expect(services.evaluation.compareJudges).not.toHaveBeenCalled();
  });

  it('shows failures and an empty field without manufacturing scores', async () => {
    services.evaluation.compareJudges.mockRejectedValueOnce(new Error('Reference is unavailable'));
    const result = renderPage();
    expect(await screen.findByText('Reference is unavailable')).toBeInTheDocument();
    result.unmount();
    services.evaluation.compareJudges.mockResolvedValue({ ...pair, fields: [{ field: 'outcome', groups: [] }] });
    renderPage();
    expect(await screen.findByText('No matching decisions for outcome.')).toBeInTheDocument();
  });

  it('reports a non-sample suite without querying its evaluations', async () => {
    const ordinary = { ...suite, protocol: { ...suite.protocol, samples: undefined } };
    services.suite.get.mockResolvedValue(ordinary);
    renderPage('');
    expect(await screen.findByText('This suite does not contain sample-scored evaluations.')).toBeInTheDocument();
    expect(services.evaluation.list).not.toHaveBeenCalled();
  });

  it('pages evaluation choices and preserves a selected item across pages', async () => {
    services.evaluation.list.mockImplementation(async (params: { page?: number; checkpointKey?: string }) => ({
      evaluations: params.checkpointKey ? evaluations : params.page === 2 ? [evaluations[2]] : evaluations.slice(0, 2),
      pagination: { page: params.page ?? 1, limit: 100, total: 101, pages: params.checkpointKey ? 1 : 2 }
    }));
    renderPage('a=e1');
    const navigation = await screen.findByRole('navigation', { name: 'Evaluation pages' });
    await userEvent.click(within(navigation).getByRole('button', { name: 'Go to page 2' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Second evaluation' }));
    expect(await screen.findByRole('option', { name: 'First repeat · e3' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'First model · e1' })).toBeInTheDocument();
  });
});
