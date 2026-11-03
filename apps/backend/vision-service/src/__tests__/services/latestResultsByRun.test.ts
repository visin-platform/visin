import { vi } from 'vitest';
import Evaluation from '../../models/Evaluation';
import Training from '../../models/Training';
import { evaluationScope } from '../../services/evaluationScope';
import { latestResultsByRun } from '../../services/resultAggregation';

vi.mock('../../models/Evaluation', async () => {
  const module = await (() => ({ find: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../models/Training', async () => {
  const module = await (() => ({ find: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/evaluationScope', async () => {
  const module = await (() => ({ evaluationScope: vi.fn() }))();
  return Object.assign({ default: module }, module);
});

it('summarizes the latest readable attempt per run without averaging older or private suite results into it', async () => {
  const training = (id: string, projectId?: string) => ({
    _id: id,
    name: id,
    uuid: `uuid-${id}`,
    status: 'completed',
    projectId
  });
  vi.mocked(Training.find).mockResolvedValue([
    training('mine', 'full'),
    training('public', 'read'),
    training('empty', 'read'),
    training('secret', 'private'),
    training('orphan')
  ]);
  vi.mocked(evaluationScope).mockResolvedValue({ full: ['full'], published: ['read'] });
  const row = (trainingId: string, projectId: string, day: number, score: number, extra = {}) => ({
    source: { trainingId },
    projectId,
    receivedAt: new Date(2026, 0, day),
    results: { day: { car: { iou: score } } },
    ...extra
  });
  const lean = vi
    .fn()
    .mockResolvedValue([
      row('mine', 'full', 1, 0.2),
      row('mine', 'full', 2, 0.8, { suite: { id: 'suite' } }),
      row('public', 'read', 1, 0.4),
      row('public', 'read', 2, 0.6, { publishedAt: new Date(), suite: { id: 'suite' } }),
      row('public', 'read', 3, 1, { suite: { id: 'suite' } }),
      row('public', 'read', 4, 0.1, { executedAt: new Date(2025, 0, 1) })
    ]);
  vi.mocked(Evaluation.find).mockReturnValue({ select: () => ({ lean }) } as unknown as ReturnType<
    typeof Evaluation.find
  >);
  const { comparison } = await latestResultsByRun('actor', ['mine', 'public', 'empty', 'secret', 'orphan', 'missing']);
  expect(comparison).toEqual([
    {
      training: { _id: 'mine', name: 'mine', uuid: 'uuid-mine', status: 'completed' },
      aggregatedResults: { day: { car: { iou: { mean: 0.8, std: 0 } } } },
      testResultsCount: 2
    },
    {
      training: { _id: 'public', name: 'public', uuid: 'uuid-public', status: 'completed' },
      aggregatedResults: { day: { car: { iou: { mean: 0.6, std: 0 } } } },
      testResultsCount: 3
    },
    {
      training: { _id: 'empty', name: 'empty', uuid: 'uuid-empty', status: 'completed' },
      aggregatedResults: null,
      testResultsCount: 0
    }
  ]);
  expect(Evaluation.find).toHaveBeenCalledWith(
    expect.objectContaining({
      'source.trainingId': { $in: ['mine', 'public', 'empty'] },
      deletedAt: null,
      status: 'completed',
      supersededById: { $exists: false }
    })
  );
});
