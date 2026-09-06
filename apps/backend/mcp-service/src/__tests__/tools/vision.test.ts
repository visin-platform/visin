jest.mock('../../vision', () => ({
  vision: {
    listProjects: jest.fn(),
    getProject: jest.fn(),
    getDashboardStats: jest.fn(),
    getTraining: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    listTrainings: jest.fn(),
    getTrainingWithEpochs: jest.fn(),
    getTrainingConfigs: jest.fn(),
    updateTraining: jest.fn(),
    compareTrainings: jest.fn(),
    listTestResults: jest.fn(),
    listBenchmarks: jest.fn()
  }
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vision } from '../../vision';
import { VisinError } from '../../http';
import { visionRead, visionWrite } from '../../tools/vision';

type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ text: string }>;
}>;

const mocked = vision as unknown as Record<string, jest.Mock>;

/** Register both modules and hand back the handlers by tool name. */
function handlers(): Record<string, Handler> {
  const found: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      found[name] = handler;
    }
  } as unknown as McpServer;

  const caller = { token: 'vsn_live_abc' };
  visionRead.register(server, caller);
  visionWrite.register(server, caller);
  return found;
}

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await handlers()[name](args);
  return { text: result.content[0].text, isError: result.isError === true };
};

const training = (over: Record<string, unknown> = {}) => ({
  _id: 't1',
  name: 'baseline',
  status: 'completed',
  tags: [],
  ...over
});

const epochs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    epoch: i + 1,
    results: { loss: 1 - i / (n * 2), mAP: i / (n * 2) },
    epoch_time: 120,
    timestamp: '2026-09-01T00:00:00.000Z'
  }));

beforeEach(() => {
  jest.clearAllMocks();
  // Most tools take a training id and resolve it to the uuid the results
  // endpoints filter on, so a run has to be resolvable by default.
  mocked.getTraining.mockResolvedValue(training({ uuid: 'the-uuid' }));
  // get_training reads a run's settings alongside its epochs; most runs here
  // have none recorded, which is a real state and the quieter default.
  mocked.getTrainingConfigs.mockResolvedValue([]);
});

describe('list_projects', () => {
  it('names each project with the slug the other tools take', async () => {
    mocked.listProjects.mockResolvedValue([
      { _id: 'p1', name: 'Roadside', slug: 'roadside', isPublic: true, description: 'Cameras' },
      { _id: 'p2', name: 'Secret', isPublic: false }
    ]);

    const { text } = await call('list_projects');

    expect(text).toContain('Roadside (public) — Cameras  [roadside]');
    // No slug set, so the id has to stand in — otherwise the model has nothing
    // to pass to get_project.
    expect(text).toContain('Secret (private)  [p2]');
  });

  it('explains an empty result rather than just saying none', async () => {
    mocked.listProjects.mockResolvedValue([]);

    const { text } = await call('list_projects');

    expect(text).toContain('private project is invisible');
  });

  it('says which search came back empty', async () => {
    mocked.listProjects.mockResolvedValue([]);
    expect((await call('list_projects', { search: 'lidar' })).text).toContain('"lidar"');
  });

  it('caps a very long list and says what it left out', async () => {
    mocked.listProjects.mockResolvedValue(
      Array.from({ length: 80 }, (_, i) => ({ _id: `p${i}`, name: `P${i}`, isPublic: true }))
    );

    const { text } = await call('list_projects');

    expect(text).toContain('first 50 of 80 projects');
  });
});

describe('get_project', () => {
  it('answers one question with both endpoints it takes', async () => {
    mocked.getProject.mockResolvedValue({
      _id: 'p1',
      name: 'Roadside',
      isPublic: false,
      description: 'Cameras'
    });
    mocked.getDashboardStats.mockResolvedValue({
      trainingStats: {
        totalTrainings: 12,
        totalTime: 33_000,
        totalEpochs: 1400,
        avgEpochTime: 23.5,
        totalCpuCost: 0.05,
        totalGpuCost: 1.83,
        totalCost: 1.88
      },
      testResultsCount: 40,
      visualizationsCount: 3,
      benchmarksCount: 2
    });

    const { text } = await call('get_project', { project: 'roadside' });

    expect(text).toContain('Roadside (private)');
    expect(text).toContain('12 training runs, 1,400 epochs, 9h 10m of compute');
    expect(text).toContain('Average epoch: 24s');
    expect(text).toContain('40 test results, 2 benchmarks, 3 visualizations');
  });

  it('leaves out the cost line for a project with no recorded time', async () => {
    mocked.getProject.mockResolvedValue({ _id: 'p1', name: 'Empty', isPublic: true });
    mocked.getDashboardStats.mockResolvedValue({
      trainingStats: {
        totalTrainings: 0,
        totalTime: 0,
        totalEpochs: 0,
        avgEpochTime: 0,
        totalCpuCost: 0,
        totalGpuCost: 0,
        totalCost: 0
      },
      testResultsCount: 0,
      visualizationsCount: 0,
      benchmarksCount: 0
    });

    const { text } = await call('get_project', { project: 'empty' });

    expect(text).not.toContain('Estimated compute cost');
    expect(text).not.toContain('Average epoch');
  });
});

describe('list_trainings', () => {
  it('summarises each run and passes the filters through', async () => {
    mocked.listTrainings.mockResolvedValue({
      trainings: [
        training({ metrics: { epochCount: 300, totalTime: 36_000 }, tags: ['v2'] }),
        training({ _id: 't2', name: 'ablation', status: 'running' })
      ],
      pagination: { total: 2 }
    });

    const { text } = await call('list_trainings', { project: 'roadside', status: 'completed' });

    expect(mocked.listTrainings).toHaveBeenCalledWith('vsn_live_abc', {
      projectId: 'roadside',
      status: 'completed',
      search: undefined,
      tags: undefined,
      limit: 30
    });
    expect(text).toContain('baseline [completed] · 300 epochs · 10h · v2  [id t1]');
    expect(text).toContain('ablation [running]  [id t2]');
  });

  it('says how many more there are when the page is not everything', async () => {
    mocked.listTrainings.mockResolvedValue({
      trainings: [training()],
      pagination: { total: 90 }
    });

    expect((await call('list_trainings')).text).toContain('1 of 90 runs');
  });

  it('reports an empty result plainly', async () => {
    mocked.listTrainings.mockResolvedValue({ trainings: [] });
    expect((await call('list_trainings')).text).toBe('No training runs match that.');
  });
});

describe('get_training', () => {
  it('reports the run, its totals, its final epoch and both ends of every metric', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training({ description: 'first pass', tags: ['v2'], startTime: '2026-08-01T09:00:00Z' }),
      epochs: epochs(10)
    });

    const { text } = await call('get_training', { training: 't1' });

    expect(text).toContain('baseline [completed]');
    expect(text).toContain('10 epochs over 20m');
    expect(text).toContain('Final epoch:');
    expect(text).toContain('epoch 10: loss 0.55, mAP 0.45');
    // Direction is deliberately not guessed — this server cannot know whether a
    // custom metric is better high or low.
    expect(text).toContain('does not know which direction is better');
    expect(text).toContain('loss: lowest 0.55 at epoch 10, highest 1 at epoch 1');
  });

  it('says a run has no epochs rather than inventing zeros', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training({ status: 'pending' }),
      epochs: []
    });

    const { text } = await call('get_training', { training: 't1' });

    expect(text).toContain('No epochs recorded yet.');
    expect(text).not.toContain('0 epochs over');
  });

  it('copes with an epoch that recorded nothing numeric', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training(),
      epochs: [{ epoch: 1, results: { note: 'crashed' }, epoch_time: 5 }]
    });

    expect((await call('get_training', { training: 't1' })).text).toContain('no metrics recorded');
  });
});

describe('the settings a run was launched with', () => {
  it('prints the config flat, so a recommendation can name the current value', async () => {
    // Before this, config was not exposed at all: an assistant asked what to
    // change for the next run could describe outcomes and had to guess at
    // causes, because it could not see what anything was set to.
    mocked.getTrainingWithEpochs.mockResolvedValue({ training: training(), epochs: [] });
    mocked.getTrainingConfigs.mockResolvedValue([
      {
        config_name: 'clftv2-base',
        summary: '',
        config_data: {
          model: { window_size: 16, backbone: 'swin-b' },
          optimizer: { lr: 0.0001 },
          classes: ['vehicle', 'human']
        }
      }
    ]);

    const { text } = await call('get_training', { training: 't1' });

    expect(text).toContain('Configuration (clftv2-base):');
    expect(text).toContain('model.window_size = 16');
    expect(text).toContain('optimizer.lr = 0.0001');
    expect(text).toContain('classes = ["vehicle","human"]');
  });

  it('still answers about the run when the config cannot be read', async () => {
    // The settings are context for the numbers, not the answer. A run whose
    // config was deleted still has results worth reading.
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training(),
      epochs: [{ epoch: 1, results: { loss: 0.5 } }]
    });
    mocked.getTrainingConfigs.mockRejectedValue(new VisinError('Training not found', 404));

    const { text, isError } = await call('get_training', { training: 't1' });

    expect(isError).toBe(false);
    expect(text).toContain('loss 0.5');
    expect(text).not.toContain('Configuration');
  });

  it('caps a config with hundreds of keys', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({ training: training(), epochs: [] });
    mocked.getTrainingConfigs.mockResolvedValue([
      {
        summary: '',
        config_data: Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [`k${String(i).padStart(2, '0')}`, i])
        )
      }
    ]);

    const { text } = await call('get_training', { training: 't1' });

    expect(text).toContain('k39 = 39');
    expect(text).not.toContain('k40 = 40');
    expect(text).toContain('10 further settings not shown');
  });
});

describe('get_training', () => {
  it('never asks for a sampled series', async () => {
    // It reports where every metric peaked. Given a dozen sampled epochs it
    // would answer that question about the wrong epoch, confidently.
    mocked.getTrainingWithEpochs.mockResolvedValue({ training: training(), epochs: epochs(300) });

    await call('get_training', { training: 't1' });

    expect(mocked.getTrainingWithEpochs).toHaveBeenCalledWith('vsn_live_abc', 't1');
  });
});

describe('not saying the same thing twice', () => {
  it('drops tags the run name already contains', async () => {
    // Real runs are named after what distinguishes them and then tagged with
    // the same words, so a listing spent about a third of every row restating
    // the row's own first half.
    mocked.listTrainings.mockResolvedValue({
      trainings: [
        training({
          name: 'WAYMO CLFTv2-Base Fusion (window16 ablation)',
          tags: ['WAYMO', 'CLFTv2', 'Base', 'Fusion', 'Ablation']
        })
      ]
    });

    const { text } = await call('list_trainings', {});

    expect(text).toContain('WAYMO CLFTv2-Base Fusion (window16 ablation) [completed]');
    expect(text).not.toContain('· WAYMO, CLFTv2');
  });

  it('keeps a tag that adds something the name does not say', async () => {
    mocked.listTrainings.mockResolvedValue({
      trainings: [training({ name: 'window16 ablation', tags: ['WAYMO', 'window16'] })]
    });

    expect((await call('list_trainings', {})).text).toContain('· WAYMO');
  });

  it('drops config entries that repeat the run record', async () => {
    // Pipelines write a `Summary` holding the run's own name and a `tags`
    // array holding its own tags. Matched by value, not by key name, so it
    // keeps working whatever a given pipeline called them.
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training({ name: 'window16 ablation', tags: ['ZOD'] }),
      epochs: []
    });
    mocked.getTrainingConfigs.mockResolvedValue([
      {
        summary: '',
        config_data: { Summary: 'window16 ablation', tags: ['ZOD'], lr: 0.0001 }
      }
    ]);

    const { text } = await call('get_training', { training: 't1' });

    expect(text).toContain('lr = 0.0001');
    expect(text).not.toContain('Summary =');
    expect(text).not.toContain('tags =');
  });

  it('still shows the run its own tags once', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training({ name: 'run', tags: ['ZOD', 'Ablation'] }),
      epochs: []
    });

    expect((await call('get_training', { training: 't1' })).text).toContain('Tags: ZOD, Ablation.');
  });
});

describe('get_training_curve', () => {
  it('samples a long run down and says that it did', async () => {
    // The whole reason this tool exists: 300 epochs is thousands of numbers
    // that stay in the conversation and are re-sent on every later message.
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training(),
      epochs: epochs(300)
    });

    const { text } = await call('get_training_curve', { training: 't1' });

    expect(text).toContain('300 epochs, showing 12 of them');
    expect(text).toContain('Sampled evenly');

    // Transposed: the epochs are named once and each metric is a line of
    // values in that order. Naming them per line spent two thirds of a real
    // curve restating `train.loss` and friends.
    const epochLine = text.split('\n').find((line) => line.startsWith('epochs: '))!;
    expect(epochLine.split(', ')).toHaveLength(12);
    expect(epochLine).toContain('epochs: 1,');
    expect(epochLine.endsWith('300')).toBe(true);
    expect(text).toMatch(/^loss: [\d.,\s]+$/m);
  });

  it('honours a raised point count', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({ training: training(), epochs: epochs(300) });

    const { text } = await call('get_training_curve', { training: 't1', points: 30 });

    const epochLine = text.split('\n').find((line) => line.startsWith('epochs: '))!;
    expect(epochLine.split(', ')).toHaveLength(30);
  });

  it('asks vision-service to sample, rather than shipping the whole series', async () => {
    // A 100-epoch run answers /epochs with 196 KB. Sampling on this side means
    // having already paid to ship and parse all of it.
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training(),
      epochs: epochs(12),
      totalEpochs: 300
    });

    await call('get_training_curve', { training: 't1', points: 20 });

    expect(mocked.getTrainingWithEpochs).toHaveBeenCalledWith('vsn_live_abc', 't1', 20);
  });

  it('reports the run\'s real length, not the number of points it was sent', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training(),
      epochs: epochs(12),
      totalEpochs: 300
    });

    const { text } = await call('get_training_curve', { training: 't1' });

    expect(text).toContain('300 epochs, showing 12 of them');
    expect(text).toContain('Sampled evenly from 300 epochs');
  });

  it('still samples locally when the service answered in full', async () => {
    // An older vision-service ignores the parameter. Sampling an already
    // sampled series is a no-op, so this costs nothing when it does honour it.
    mocked.getTrainingWithEpochs.mockResolvedValue({ training: training(), epochs: epochs(300) });

    const { text } = await call('get_training_curve', { training: 't1' });

    expect(text.split('\n').find((l) => l.startsWith('epochs: '))!.split(', ')).toHaveLength(12);
    expect(text).toContain('300 epochs, showing 12 of them');
  });

  it('gives every metric one line, whatever the run recorded', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training(),
      epochs: [
        { epoch: 1, results: { val: { loss: 0.9, mean_iou: 0.1 } } },
        { epoch: 2, results: { val: { loss: 0.4, mean_iou: 0.3 } } }
      ]
    });

    const { text } = await call('get_training_curve', { training: 't1' });

    expect(text).toContain('epochs: 1, 2');
    expect(text).toContain('val.loss: 0.9, 0.4');
    expect(text).toContain('val.mean_iou: 0.1, 0.3');
  });

  it('marks an epoch that did not record a metric the others did', async () => {
    // Otherwise the values shift left and every later number is read against
    // the wrong epoch — the one way a transposed layout can lie.
    mocked.getTrainingWithEpochs.mockResolvedValue({
      training: training(),
      epochs: [
        { epoch: 1, results: { loss: 0.9, extra: 5 } },
        { epoch: 2, results: { loss: 0.4 } }
      ]
    });

    const { text } = await call('get_training_curve', { training: 't1' });

    expect(text).toContain('extra: 5, -');
  });

  it('shows a short run whole, with no note about sampling', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({ training: training(), epochs: epochs(4) });

    const { text } = await call('get_training_curve', { training: 't1' });

    expect(text).not.toContain('Sampled evenly');
  });

  it('says so when there is no curve yet', async () => {
    mocked.getTrainingWithEpochs.mockResolvedValue({ training: training(), epochs: [] });
    expect((await call('get_training_curve', { training: 't1' })).text).toContain(
      'recorded no epochs yet'
    );
  });
});

describe('compare_trainings', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    training: { _id: 't1', name: 'baseline', status: 'completed' },
    metrics: {
      totalEpochs: 300,
      totalTime: 36_000,
      avgEpochTime: 120,
      cost: { totalHours: 10, totalCost: 2.06 }
    },
    lastEpoch: { epoch: 300, results: { mAP: 0.81 } },
    epochs: [
      { epoch: 0, results: { mAP: 0.11 } },
      { epoch: 150, results: { mAP: 0.94 } },
      { epoch: 300, results: { mAP: 0.81 } }
    ],
    testResultsCount: 4,
    benchmarks: [{ _id: 'b1', results: [{ total_parameters_m: 25.4, fps: 91 }] }],
    ...over
  });

  it('puts the runs side by side without the full epoch series', async () => {
    // compareTrainings returns every epoch of every run; rendering them would
    // be the single most expensive thing this server could hand back. The
    // series is read, not printed.
    mocked.compareTrainings.mockResolvedValue({
      comparison: [entry(), entry({ training: { _id: 't2', name: 'ablation', status: 'completed' } })]
    });

    const { text } = await call('compare_trainings', { trainings: ['t1', 't2'] });

    expect(text).toContain('baseline [completed]');
    expect(text).toContain('300 epochs over 10h, about 2.06 in compute');
    expect(text).toContain('final (epoch 300): mAP 0.81');
    expect(text).toContain('4 test results');
    expect(text).toContain('25.4M params, 91 fps');
    expect(text).not.toContain('- epoch 150');
  });

  it('reports where each metric peaked, not only where the run stopped', async () => {
    // The whole point. This run ends on mAP 0.81 having reached 0.94 at epoch
    // 150; judged on its last epoch it loses a comparison it should win. A real
    // run on this platform ends at val.loss 1.0479 and reached 0.2402 at epoch
    // 13 — a four-fold gap between the answer and the wrong answer.
    mocked.compareTrainings.mockResolvedValue({ comparison: [entry()] });

    const { text } = await call('compare_trainings', { trainings: ['t1', 't2'] });

    expect(text).toContain('best and worst across all 3 epochs:');
    expect(text).toContain('mAP: 0.11 at epoch 0, 0.94 at epoch 150');
    expect(text).toContain('final epoch is not its result');
  });

  /** A run recording `n` metrics, so the shared line budget can be observed. */
  const withMetrics = (n: number, over: Record<string, unknown> = {}) =>
    entry({
      epochs: [
        {
          epoch: 1,
          results: Object.fromEntries(
            Array.from({ length: n }, (_, i) => [`metric_${String(i).padStart(2, '0')}`, i / 10])
          )
        }
      ],
      ...over
    });

  it('spells out every metric when few enough runs share the budget', async () => {
    // The fixed per-run cap this replaced dropped `val.mean_iou` from a
    // ten-metric segmentation run — alphabetically last, and the only number
    // anyone was going to read.
    mocked.compareTrainings.mockResolvedValue({ comparison: [withMetrics(10)] });

    const { text } = await call('compare_trainings', { trainings: ['t1', 't2'] });

    expect(text).toContain('metric_09: 0.9 at epoch 1');
    expect(text).not.toContain('further metrics not shown');
  });

  it('narrows what each run spells out as more runs share the result', async () => {
    // Thirty runs times a dozen metrics is four hundred lines, past the ceiling
    // in `ok` — the result would arrive truncated mid-run rather than short.
    mocked.compareTrainings.mockResolvedValue({
      comparison: Array.from({ length: 30 }, (_, i) =>
        withMetrics(10, { training: { _id: `t${i}`, name: `run ${i}`, status: 'completed' } })
      )
    });

    const { text } = await call('compare_trainings', { trainings: Array.from({ length: 30 }, (_, i) => `t${i}`) });

    expect(text).toContain('metric_02: 0.2 at epoch 1');
    expect(text).not.toContain('metric_03');
    expect(text).toContain('7 further metrics not shown');
    // Short of the ceiling, so nothing is cut mid-run.
    expect(text).not.toContain('[Truncated');
  });

  it('says when some of the runs asked for were not visible', async () => {
    // Silently comparing two of the three asked for would answer a different
    // question than the one put, without saying so.
    mocked.compareTrainings.mockResolvedValue({ comparison: [entry()] });

    const { text } = await call('compare_trainings', { trainings: ['t1', 't2', 't3'] });

    expect(text).toContain('1 of the 3 runs asked for are visible');
  });

  it('reports none visible rather than an empty comparison', async () => {
    mocked.compareTrainings.mockResolvedValue({ comparison: [] });

    expect((await call('compare_trainings', { trainings: ['t1', 't2'] })).text).toBe(
      'None of those runs are visible to this key.'
    );
  });

  it('handles a run with no epochs or benchmarks', async () => {
    mocked.compareTrainings.mockResolvedValue({
      comparison: [
        entry({
          lastEpoch: null,
          epochs: [],
          benchmarks: [],
          testResultsCount: 0,
          metrics: { totalEpochs: 0, totalTime: 0, avgEpochTime: 0 }
        })
      ]
    });

    const { text } = await call('compare_trainings', { trainings: ['t1', 't2'] });

    expect(text).toContain('0 epochs over 0s');
    expect(text).not.toContain('final (epoch');
  });
});

/**
 * These two endpoints filter on the training's `uuid`; every tool here takes
 * its `_id`. Zod drops an unknown query key silently, so passing the id
 * filtered nothing and returned every run's results as though they belonged to
 * the one asked about — a wrong answer that looked entirely right.
 */
describe('scoping results to one run', () => {
  it('resolves an id to the uuid the endpoint actually filters on', async () => {
    mocked.getTraining.mockResolvedValue(training({ uuid: 'the-uuid' }));
    mocked.listTestResults.mockResolvedValue({ testResults: [] });

    await call('get_test_results', { training: 't1' });

    expect(mocked.getTraining).toHaveBeenCalledWith('vsn_live_abc', 't1');
    expect(mocked.listTestResults.mock.calls[0][1]).toMatchObject({ training_uuid: 'the-uuid' });
  });

  it('does the same for benchmarks', async () => {
    mocked.getTraining.mockResolvedValue(training({ uuid: 'the-uuid' }));
    mocked.listBenchmarks.mockResolvedValue({ benchmarks: [] });

    await call('get_benchmarks', { training: 't1' });

    expect(mocked.listBenchmarks.mock.calls[0][1]).toMatchObject({ training_uuid: 'the-uuid' });
  });

  it('passes a uuid straight through rather than looking it up', async () => {
    mocked.listTestResults.mockResolvedValue({ testResults: [] });

    await call('get_test_results', { training: '3205072b-d453-4480-bb0b-bbf7564a6435' });

    expect(mocked.getTraining).not.toHaveBeenCalled();
    expect(mocked.listTestResults.mock.calls[0][1]).toMatchObject({
      training_uuid: '3205072b-d453-4480-bb0b-bbf7564a6435'
    });
  });

  it('sends no filter at all when no run was named', async () => {
    mocked.listTestResults.mockResolvedValue({ testResults: [] });

    await call('get_test_results', {});

    expect(mocked.getTraining).not.toHaveBeenCalled();
    expect(mocked.listTestResults.mock.calls[0][1].training_uuid).toBeUndefined();
  });

  it('says so rather than filtering on nothing when a run has no uuid', async () => {
    mocked.getTraining.mockResolvedValue(training({ uuid: undefined }));

    const { text, isError } = await call('get_test_results', { training: 't1' });

    expect(isError).toBe(true);
    expect(text).toContain('no uuid recorded');
    expect(mocked.listTestResults).not.toHaveBeenCalled();
  });
});

describe('get_test_results', () => {
  it('renders per-class scores as a table rather than nested JSON', async () => {
    mocked.listTestResults.mockResolvedValue({
      testResults: [
        {
          _id: 'tr1',
          epoch: 40,
          timestamp: '2026-09-01T10:00:00Z',
          training: { _id: 't1', name: 'baseline' },
          test_results: {
            night: { car: { iou: 0.81, precision: 0.9, recall: 0.7, f1_score: 0.79, ap: 0.85 } }
          }
        }
      ]
    });

    const { text } = await call('get_test_results', { training: 't1' });

    expect(text).toContain('baseline, epoch 40 (2026-09-01)');
    expect(text).toContain('night:');
    expect(text).toContain('car: IoU 0.81  P 0.9  R 0.7  F1 0.79  AP 0.85');
  });

  it('omits a score the run did not record', async () => {
    mocked.listTestResults.mockResolvedValue({
      testResults: [{ _id: 'tr1', epoch: 1, test_results: { day: { car: { iou: 0.5 } } } }]
    });

    const { text } = await call('get_test_results', {});

    expect(text).toContain('car: IoU 0.5');
    expect(text).not.toContain('P ');
  });

  it('reports an empty result plainly', async () => {
    mocked.listTestResults.mockResolvedValue({ testResults: [] });
    expect((await call('get_test_results', {})).text).toBe('No test results match that.');
  });
});

describe('get_benchmarks', () => {
  it('reports size, speed and memory with the hardware they were measured on', async () => {
    mocked.listBenchmarks.mockResolvedValue({
      benchmarks: [
        {
          _id: 'b1',
          epoch: 40,
          timestamp: '2026-09-01T00:00:00Z',
          system_info: { gpu_name: 'RTX 4090' },
          results: [
            {
              model_name: 'yolov8',
              total_parameters_m: 25.4,
              flops_giga: 78.9,
              fps: 91.2,
              mean_time_ms: 10.9,
              gpu_memory_max_mb: 2048,
              image_size: 640
            }
          ]
        }
      ]
    });

    const { text } = await call('get_benchmarks', { training: '3205072b-d453-4480-bb0b-bbf7564a6435' });

    expect(text).toContain('Benchmark 2026-09-01, epoch 40 on RTX 4090');
    expect(text).toContain('yolov8: 25.4M params, 78.9 GFLOPs, 91.2 fps, 10.9 ms/frame');
    expect(text).toContain('2048 MB GPU peak, 640px');
  });

  it('says so when a benchmark recorded no measurements', async () => {
    mocked.listBenchmarks.mockResolvedValue({
      benchmarks: [{ _id: 'b1', results: [{ backbone: 'resnet50' }] }]
    });

    expect((await call('get_benchmarks', {})).text).toContain('no measurements recorded');
  });

  it('reports an empty result plainly', async () => {
    mocked.listBenchmarks.mockResolvedValue({ benchmarks: [] });
    expect((await call('get_benchmarks', {})).text).toBe('No benchmarks match that.');
  });
});

describe('write tools', () => {
  it('creates a project and reports the slug to use next', async () => {
    mocked.createProject.mockResolvedValue({
      _id: 'p1',
      name: 'Roadside',
      slug: 'roadside',
      isPublic: false
    });

    const { text } = await call('create_project', { name: 'Roadside' });

    expect(text).toBe('Created "Roadside" (private), slug roadside.');
  });

  it('confirms a project update, including its visibility', async () => {
    mocked.updateProject.mockResolvedValue({ _id: 'p1', name: 'Renamed', isPublic: true });

    expect((await call('update_project', { project: 'p1', name: 'Renamed' })).text).toBe(
      'Updated "Renamed" (public).'
    );
  });

  it('confirms a training update', async () => {
    mocked.updateTraining.mockResolvedValue(training({ name: 'baseline v2' }));

    expect((await call('update_training', { training: 't1', name: 'baseline v2' })).text).toBe(
      'Updated "baseline v2" [completed].'
    );
  });
});

describe('failures reach the model as something it can act on', () => {
  it('turns a 403 into a "do not retry"', async () => {
    mocked.listTrainings.mockRejectedValue(new VisinError('Access denied to project', 403));

    const { text, isError } = await call('list_trainings');

    expect(isError).toBe(true);
    expect(text).toContain('Do not retry');
  });

  it('warns that a 404 may be a permissions answer', async () => {
    mocked.getTrainingWithEpochs.mockRejectedValue(new VisinError('Training not found', 404));

    expect((await call('get_training', { training: 'nope' })).text).toContain('private project');
  });

  it('never lets a thrown error escape a handler', async () => {
    mocked.listProjects.mockRejectedValue(new Error('socket hang up'));

    const { text, isError } = await call('list_projects');

    expect(isError).toBe(true);
    expect(text).toBe('socket hang up');
  });
});
