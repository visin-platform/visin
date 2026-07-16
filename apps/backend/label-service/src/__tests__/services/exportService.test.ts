jest.mock('../../models/LabelTask', () => ({
  LabelTask: { find: jest.fn() },
}));
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { find: jest.fn() },
}));
jest.mock('../../models/LabelImage', () => ({
  LabelImage: { find: jest.fn() },
}));

import { exportRows, exportCsv, jobStats } from '../../services/exportService';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnswer } from '../../models/LabelAnswer';
import { LabelImage } from '../../models/LabelImage';
import type { ILabelJob } from '../../models/LabelJob';

const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnswer = LabelAnswer as unknown as Record<string, jest.Mock>;
const mockedImage = LabelImage as unknown as Record<string, jest.Mock>;

const singleChoiceJob = { _id: 'j1', taskType: 'single_choice', redundancy: 2 } as unknown as ILabelJob;
const maskJob = { _id: 'j1', taskType: 'mask_toggle', redundancy: 2 } as unknown as ILabelJob;

const task = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  labelImageId: `img-${id}`,
  answersCount: 0,
  payload: undefined,
  ...overrides,
});

const answer = (taskId: string, userId: string, overrides: Record<string, unknown> = {}) => ({
  taskId,
  userId,
  userEmail: `${userId}@x.com`,
  userName: userId.toUpperCase(),
  ...overrides,
});

const stubData = (tasks: unknown[], answers: unknown[], frames?: unknown[]) => {
  mockedTask.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(tasks) });
  mockedAnswer.find.mockResolvedValue(answers);
  mockedImage.find.mockResolvedValue(
    frames ?? (tasks as { _id: string }[]).map((t) => ({ _id: `img-${t._id}`, path: `frames/${t._id}.png` }))
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('exportRows single_choice', () => {
  it('aggregates per-task answers with majority consensus', async () => {
    stubData(
      [task('t1', { stratum: 's1', answersCount: 2 })],
      [answer('t1', 'u1', { choiceKey: 'good', elapsedMs: 5 }), answer('t1', 'u2', { choiceKey: 'good' })]
    );

    const rows = await exportRows(singleChoiceJob);

    expect(rows).toEqual([
      {
        taskId: 't1',
        frame: 'frames/t1.png',
        stratum: 's1',
        answers: [
          { userEmail: 'u1@x.com', userName: 'U1', choiceKey: 'good', elapsedMs: 5 },
          { userEmail: 'u2@x.com', userName: 'U2', choiceKey: 'good', elapsedMs: undefined },
        ],
        consensus: 'good',
      },
    ]);
  });

  it('reports a tie as null consensus and no answers as null', async () => {
    stubData(
      [task('t1'), task('t2')],
      [answer('t1', 'u1', { choiceKey: 'good' }), answer('t1', 'u2', { choiceKey: 'bad' })]
    );

    const rows = await exportRows(singleChoiceJob);

    expect(rows[0].consensus).toBeNull();
    expect(rows[1].consensus).toBeNull();
  });
});

describe('exportRows mask_toggle', () => {
  it('explodes one row per mask with per-user verdicts', async () => {
    stubData(
      [
        task('t1', {
          payload: { maskMap: { imageId: 'idmap', masks: [{ id: 1, class: 'vehicle' }, { id: 2, class: 'sign' }] } },
        }),
      ],
      [answer('t1', 'u1', { rejectedMaskIds: [2] }), answer('t1', 'u2', { rejectedMaskIds: [] })]
    );

    const rows = await exportRows(maskJob);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      maskId: 1,
      class: 'vehicle',
      verdicts: [
        { userEmail: 'u1@x.com', verdict: 'correct' },
        { userEmail: 'u2@x.com', verdict: 'correct' },
      ],
      consensus: 'correct',
    });
    expect(rows[1]).toMatchObject({ maskId: 2, consensus: null }); // u1 incorrect vs u2 correct → tie
  });
});

describe('exportCsv', () => {
  it('emits long-format single_choice rows and escapes commas', async () => {
    stubData(
      [task('t1', { stratum: 'a,b' })],
      [answer('t1', 'u1', { choiceKey: 'good', elapsedMs: 3 })]
    );

    const csv = await exportCsv(singleChoiceJob);

    expect(csv).toBe(
      'taskId,frame,stratum,userEmail,choiceKey,elapsedMs\n' + 't1,frames/t1.png,"a,b",u1@x.com,good,3\n'
    );
  });

  it('emits one row per user-mask verdict for mask_toggle', async () => {
    stubData(
      [task('t1', { payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'vehicle' }] } } })],
      [answer('t1', 'u1', { rejectedMaskIds: [1] })]
    );

    const csv = await exportCsv(maskJob);

    expect(csv.trim().split('\n')).toEqual([
      'taskId,frame,stratum,maskId,class,userEmail,verdict',
      't1,frames/t1.png,,1,vehicle,u1@x.com,incorrect',
    ]);
  });
});

describe('jobStats', () => {
  it('computes totals, per-user, per-stratum, and pairwise agreement', async () => {
    stubData(
      [
        task('t1', { stratum: 'v', answersCount: 2 }),
        task('t2', { answersCount: 1 }),
      ],
      [
        answer('t1', 'u1', { choiceKey: 'good' }),
        answer('t1', 'u2', { choiceKey: 'good' }),
        answer('t2', 'u1', { choiceKey: 'bad' }),
      ]
    );

    const stats = await jobStats(singleChoiceJob);

    expect(stats.tasks).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.answers).toBe(3);
    expect(stats.perUser).toEqual([
      { userEmail: 'u1@x.com', userName: 'U1', answered: 2 },
      { userEmail: 'u2@x.com', userName: 'U2', answered: 1 },
    ]);
    expect(stats.perStratum).toEqual([
      { stratum: '(none)', tasks: 1, completed: 0 },
      { stratum: 'v', tasks: 1, completed: 1 },
    ]);
    expect(stats.agreement).toBe(1); // the single pair agrees
  });

  it('computes mask agreement as matching-verdict fraction', async () => {
    stubData(
      [
        task('t1', {
          answersCount: 2,
          payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'v' }, { id: 2, class: 's' }] } },
        }),
      ],
      [answer('t1', 'u1', { rejectedMaskIds: [1] }), answer('t1', 'u2', { rejectedMaskIds: [1, 2] })]
    );

    const stats = await jobStats(maskJob);

    expect(stats.agreement).toBe(0.5); // mask 1 matches, mask 2 differs
  });

  it('returns null agreement with no comparable pairs', async () => {
    stubData([task('t1')], [answer('t1', 'u1', { choiceKey: 'good' })]);

    expect((await jobStats(singleChoiceJob)).agreement).toBeNull();
  });
});
