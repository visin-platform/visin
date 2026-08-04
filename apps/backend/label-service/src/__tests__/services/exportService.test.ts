jest.mock('../../models/LabelTask', () => ({
  LabelTask: { find: jest.fn() },
}));
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { find: jest.fn() },
}));
jest.mock('../../models/LabelImage', () => ({
  LabelImage: { find: jest.fn() },
}));
jest.mock('../../models/LabelBundle', () => ({
  LabelBundle: { findById: jest.fn() },
}));
jest.mock('../../services/bundleService', () => ({
  maskFields: jest.fn(),
}));

import { exportRows, exportCsv, exportManifest, jobStats } from '../../services/exportService';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnswer } from '../../models/LabelAnswer';
import { LabelImage } from '../../models/LabelImage';
import { LabelBundle } from '../../models/LabelBundle';
import { maskFields } from '../../services/bundleService';
import type { ILabelJob } from '../../models/LabelJob';

const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnswer = LabelAnswer as unknown as Record<string, jest.Mock>;
const mockedImage = LabelImage as unknown as Record<string, jest.Mock>;
const mockedBundle = LabelBundle as unknown as Record<string, jest.Mock>;
const mockedMaskFields = maskFields as unknown as jest.Mock;

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
  // A thenable that also has `.sort()`: loadJobData sorts, exportManifest awaits
  // the projected query directly, and both go through this one mock.
  mockedTask.find.mockReturnValue({
    sort: jest.fn().mockResolvedValue(tasks),
    then: (resolve: (value: unknown) => unknown) => resolve(tasks),
  });
  mockedAnswer.find.mockResolvedValue(answers);
  mockedImage.find.mockResolvedValue(
    frames ?? (tasks as { _id: string }[]).map((t) => ({ _id: `img-${t._id}`, path: `frames/${t._id}.png` }))
  );
};

const csvRows = (csv: string) => csv.trim().split('\n');

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

  it('nests the bundle mask metadata and stamps each verdict with its timing', async () => {
    stubData(
      [
        task('t1', {
          stratum: 'task-level',
          payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'vehicle', stratum: 'both', kind: 'fringe' }] } },
        }),
      ],
      [answer('t1', 'u1', { rejectedMaskIds: [1], elapsedMs: 12, createdAt: new Date('2026-08-04T10:00:00Z') })]
    );

    const [row] = await exportRows(maskJob);

    expect(row.stratum).toBe('task-level');
    expect(row.mask).toEqual({ id: 1, class: 'vehicle', stratum: 'both', kind: 'fringe' });
    expect(row.verdicts).toEqual([
      {
        userEmail: 'u1@x.com',
        userName: 'U1',
        verdict: 'incorrect',
        elapsedMs: 12,
        answeredAt: '2026-08-04T10:00:00.000Z',
      },
    ]);
  });
});

describe('exportCsv', () => {
  it('emits long-format single_choice rows and escapes commas', async () => {
    stubData(
      [task('t1', { stratum: 'a,b' })],
      [answer('t1', 'u1', { choiceKey: 'good', elapsedMs: 3 })]
    );

    expect(csvRows(await exportCsv(singleChoiceJob))).toEqual([
      'taskId,frame,stratum,userEmail,choiceKey,elapsedMs,answeredAt,userName',
      't1,frames/t1.png,"a,b",u1@x.com,good,3,,U1',
    ]);
  });

  it('keeps an unanswered single_choice task in the table', async () => {
    stubData([task('t1'), task('t2')], [answer('t1', 'u1', { choiceKey: 'good' })]);

    const rows = csvRows(await exportCsv(singleChoiceJob));

    expect(rows).toHaveLength(3);
    expect(rows[2]).toBe('t2,frames/t2.png,,,,,,');
  });

  it('emits one row per user-mask verdict for mask_toggle', async () => {
    stubData(
      [task('t1', { payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'vehicle' }] } } })],
      [answer('t1', 'u1', { rejectedMaskIds: [1], elapsedMs: 40, createdAt: new Date('2026-08-04T10:00:00Z') })]
    );

    expect(csvRows(await exportCsv(maskJob))).toEqual([
      'taskId,frame,stratum,maskId,class,userEmail,verdict,elapsedMs,answeredAt,userName',
      't1,frames/t1.png,,1,vehicle,u1@x.com,incorrect,40,2026-08-04T10:00:00.000Z,U1',
    ]);
  });

  it('carries every bundle mask field as a mask_ column without shadowing the task stratum', async () => {
    stubData(
      [
        task('t1', {
          stratum: 'task-level',
          payload: {
            maskMap: {
              imageId: 'i',
              // `stratum` here is the bundle's own mask field, a different thing
              // from the task's; both have to survive the export.
              masks: [{ id: 1, class: 'vehicle', stratum: 'both', triage_llava: 'accept', bbox: [1, 2, 3, 4] }],
            },
          },
        }),
      ],
      [answer('t1', 'u1', { rejectedMaskIds: [] })]
    );

    const [header, row] = csvRows(await exportCsv(maskJob));

    expect(header.split(',')).toEqual([
      'taskId',
      'frame',
      'stratum',
      'maskId',
      'class',
      'userEmail',
      'verdict',
      'elapsedMs',
      'answeredAt',
      'mask_bbox',
      'mask_stratum',
      'mask_triage_llava',
      'userName',
    ]);
    expect(row).toContain('task-level'); // the task's stratum column
    expect(row).toContain('"[1,2,3,4]"'); // bbox survives as JSON, not "1,2,3,4"
    expect(row).toContain('both');
    expect(row).toContain('accept');
  });

  it('emits a row for a task nobody has answered, so the denominator survives', async () => {
    stubData(
      [
        task('t1', { payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'vehicle' }] } } }),
        task('t2', { payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'sign' }] } } }),
      ],
      [answer('t1', 'u1', { rejectedMaskIds: [1] })]
    );

    const rows = csvRows(await exportCsv(maskJob));

    expect(rows).toHaveLength(3); // header + one answered + one unanswered
    expect(rows[2]).toBe('t2,frames/t2.png,,1,sign,,,,,');
  });
});

describe('exportManifest', () => {
  const bundledJob = {
    _id: 'j1',
    name: 'Verify',
    taskType: 'mask_toggle',
    redundancy: 2,
    bundleId: 'b1',
    annotationSets: ['verify'],
    question: { prompt: 'Mark all incorrect masks' },
    status: 'active',
    tasksCount: 2,
    selection: { kind: 'filter', spec: { sampleN: null, seed: 42, rows: 2 } },
  } as unknown as ILabelJob;

  it('pairs each value with what the bundle holds and what the job asks about', async () => {
    stubData(
      [
        task('t1', {
          answersCount: 1,
          payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'vehicle', stratum: 'both' }] } },
        }),
        task('t2', {
          payload: { maskMap: { imageId: 'i', masks: [{ id: 1, class: 'sign', stratum: 'neither' }] } },
        }),
      ],
      [answer('t1', 'u1', { rejectedMaskIds: [] })]
    );
    mockedBundle.findById.mockResolvedValue({ _id: 'b1', name: 'corpus', annotationSets: ['verify'], counts: { frames: 9, layers: 9 } });
    mockedMaskFields.mockResolvedValue([
      {
        field: 'stratum',
        values: [
          { value: 'both', count: 100 },
          { value: 'neither', count: 40 },
          { value: 'llava_only', count: 7 },
        ],
      },
    ]);

    const manifest = await exportManifest(bundledJob);

    expect(manifest.masks?.stratum).toEqual({
      both: { bundle: 100, job: 1 },
      neither: { bundle: 40, job: 1 },
      // In the bundle, in no task — inclusion zero, which is the whole point of
      // reporting the pair rather than either number alone.
      llava_only: { bundle: 7, job: 0 },
    });
    expect(manifest.selection).toEqual({ kind: 'filter', spec: { sampleN: null, seed: 42, rows: 2 } });
    expect(manifest.progress).toEqual({ tasks: 2, completed: 0, answers: 1 });
    expect(manifest.bundle).toMatchObject({ id: 'b1', name: 'corpus' });
    expect(manifest.job).toMatchObject({ redundancy: 2, tasksCount: 2, taskType: 'mask_toggle' });
  });

  it('omits inclusion counts for a single_choice job, which has no masks to weight', async () => {
    stubData([task('t1')], []);
    mockedBundle.findById.mockResolvedValue(null);

    const manifest = await exportManifest({ ...bundledJob, taskType: 'single_choice' } as unknown as ILabelJob);

    expect(manifest.masks).toBeUndefined();
    expect(mockedMaskFields).not.toHaveBeenCalled();
    expect(manifest.bundle).toBeNull();
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
