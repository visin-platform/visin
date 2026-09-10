jest.mock('../../models/Finding', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), countDocuments: jest.fn() },
}));
jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../../models/Epoch', () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock('../../services/projectAccessService', () => ({
  ...jest.requireActual('../../services/projectAccessService'),
  checkProjectAccess: jest.fn(),
  getVisibleProjectIds: jest.fn(),
  createProjectAccessChecker: jest.fn(),
}));

import Finding from '../../models/Finding';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import { checkProjectAccess, createProjectAccessChecker, getVisibleProjectIds } from '../../services/projectAccessService';
import {
  createFinding,
  deleteFinding,
  exportFindingAsLatex,
  getFinding,
  listFindings,
} from '../../services/findingService';

const finding = Finding as unknown as Record<string, jest.Mock>;
const project = Project as unknown as Record<string, jest.Mock>;
const training = Training as unknown as Record<string, jest.Mock>;
const epoch = Epoch as unknown as Record<string, jest.Mock>;
const access = checkProjectAccess as unknown as jest.Mock;
const accessChecker = createProjectAccessChecker as unknown as jest.Mock;

const OWNER = 'u1';
const author = { kind: 'assistant' as const, label: 'Claude', userId: OWNER };

/** A Mongoose document, as the model actually hands one back. */
const asDoc = <T extends Record<string, unknown>>(data: T) => ({
  ...data,
  save: jest.fn().mockResolvedValue(undefined),
  toObject: () => data,
});

const row = (over: Record<string, unknown> = {}) =>
  asDoc({
    _id: 'f1',
    projectId: 'p1',
    title: 'Window ablation',
    body: 'window16 beats window24 on ZOD but not WAYMO.',
    trainingIds: [],
    authorKind: 'assistant',
    authorLabel: 'Claude',
    createdAt: new Date('2026-09-06T10:00:00.000Z'),
    deletedAt: null,
    ...over,
  });

/** What `Training.find(...).select(...)` resolves to when citations are named. */
const citedRunsAre = (runs: Array<Record<string, unknown>>) => {
  const select = jest.fn().mockResolvedValue(
    runs.map((run) => ({ status: 'completed', projectId: 'p1', ...run }))
  );
  training.find.mockReturnValue({ select });
  return select;
};

const listReturns = (rows: unknown[]) => {
  const limit = jest.fn().mockResolvedValue(rows);
  finding.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ limit }) });
  return limit;
};

beforeEach(() => {
  jest.clearAllMocks();
  access.mockResolvedValue(true);
  (getVisibleProjectIds as jest.Mock).mockResolvedValue(['mine']);
  project.findOne.mockResolvedValue(null);
  project.findById.mockResolvedValue({ _id: { toString: () => 'p1' }, ownerId: OWNER });
  training.countDocuments.mockResolvedValue(0);
  citedRunsAre([]);
  accessChecker.mockImplementation(() => async () => true);
  epoch.find.mockReturnValue({ select: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }) });
});

/** What `Epoch.find(...).select(...).sort(...)` resolves to. */
const epochsAre = (rows: Array<Record<string, unknown>>) => {
  const sort = jest.fn().mockResolvedValue(rows);
  epoch.find.mockReturnValue({ select: jest.fn().mockReturnValue({ sort }) });
};

describe('listFindings', () => {
  it('scopes to one project by slug, refusing if it is not visible', async () => {
    project.findOne.mockResolvedValue({ _id: { toString: () => 'p1' } });
    access.mockResolvedValue(false);

    await expect(listFindings(OWNER, { project: 'clftv2' })).rejects.toThrow();
  });

  it('finds a finding from any run it cites, not only its subject', async () => {
    // A conclusion drawn from a dozen runs should surface from any of them.
    listReturns([]);

    await listFindings(OWNER, { training: 't7' });

    expect(finding.find.mock.calls[0][0].$or).toEqual([
      { trainingId: 't7' },
      { trainingIds: 't7' },
    ]);
  });

  it('scopes an unscoped listing to visible projects before applying the limit', async () => {
    listReturns([row({ projectId: 'mine' })]);
    const visible = await listFindings(OWNER, {});
    expect(getVisibleProjectIds).toHaveBeenCalledWith(OWNER);
    expect(finding.find).toHaveBeenCalledWith({ deletedAt: null, projectId: { $in: ['mine'] } });
    expect(visible).toHaveLength(1);
    expect(access).not.toHaveBeenCalled();
  });

  it('caps how many rows one request can pull', async () => {
    const limit = listReturns([]);

    await listFindings(OWNER, { limit: 9999 });

    expect(limit).toHaveBeenCalledWith(200);
  });
});

describe('naming the runs a finding cites', () => {
  it('resolves cited ids to run names, in one query for the whole listing', async () => {
    // The gap this closes: the app could only say "draws on 2 runs" and an
    // assistant reading a finding back got a pair of ObjectIds. Neither says
    // *which* runs, which is the entire point of citing them.
    listReturns([row({ trainingIds: ['t1', 't2'] }), row({ _id: 'f2', trainingIds: ['t2'] })]);
    citedRunsAre([
      { _id: { toString: () => 't1' }, name: 'window16' },
      { _id: { toString: () => 't2' }, name: 'window8' },
    ]);

    const [first, second] = await listFindings(OWNER, { project: 'p1' });

    expect(first.citedTrainings).toEqual([
      { _id: 't1', name: 'window16', status: 'completed' },
      { _id: 't2', name: 'window8', status: 'completed' },
    ]);
    expect(second.citedTrainings).toEqual([{ _id: 't2', name: 'window8', status: 'completed' }]);
    // One lookup for both rows, not one per row.
    expect(training.find).toHaveBeenCalledTimes(1);
    expect(training.find.mock.calls[0][0]._id.$in).toEqual(['t1', 't2']);
  });

  it('does not query at all when nothing is cited', async () => {
    listReturns([row()]);

    const [only] = await listFindings(OWNER, { project: 'p1' });

    expect(only.citedTrainings).toEqual([]);
    expect(training.find).not.toHaveBeenCalled();
  });

  it('leaves out a cited run the reader may not see, without shrinking the count', async () => {
    // Nothing stops a finding on a public project citing a run in a private
    // one. Naming it would make the run's name readable by someone who cannot
    // see the run — a side channel out of exactly the check that guards it.
    listReturns([row({ trainingIds: ['mine', 'hidden'] })]);
    citedRunsAre([
      { _id: { toString: () => 'mine' }, name: 'window16', projectId: 'p1' },
      { _id: { toString: () => 'hidden' }, name: 'secret-run', projectId: 'private' },
    ]);
    accessChecker.mockImplementation(() => async (p: string) => p === 'p1');

    const [only] = await listFindings(OWNER, { project: 'p1' });

    expect(only.citedTrainings).toEqual([{ _id: 'mine', name: 'window16', status: 'completed' }]);
    // The citation is still counted, so the finding does not quietly claim
    // less evidence than it drew on.
    expect(only.trainingIds).toEqual(['mine', 'hidden']);
  });

  it('names them on a single finding and on one just created too', async () => {
    // Otherwise the field is present on two endpoints out of three and every
    // consumer has to guard it.
    finding.findOne.mockResolvedValue(row({ trainingIds: ['t1'] }));
    citedRunsAre([{ _id: { toString: () => 't1' }, name: 'window16' }]);

    const read = await getFinding('f1', OWNER);
    expect(read.citedTrainings).toEqual([{ _id: 't1', name: 'window16', status: 'completed' }]);

    training.countDocuments.mockResolvedValue(1);
    finding.create.mockImplementation(async (doc: Record<string, unknown>) => asDoc(doc));

    const created = await createFinding(
      { project: 'p1', title: 'T', body: 'B', trainingIds: ['t1'] },
      author
    );
    expect(created.citedTrainings).toEqual([{ _id: 't1', name: 'window16', status: 'completed' }]);
  });
});

describe('exporting a finding as LaTeX', () => {
  it('builds the table from recorded epochs, not from the prose', () => 
    Promise.resolve().then(async () => {
      // The point of generating this server-side: an assistant asked for a
      // results table retypes numbers it read earlier, and a slipped digit
      // becomes a wrong figure in a paper.
      finding.findOne.mockResolvedValue(
        row({ title: 'Window ablation', body: 'Prose only, no numbers.', trainingIds: ['t1'] })
      );
      citedRunsAre([{ _id: { toString: () => 't1' }, name: 'window16' }]);
      epochsAre([
        { trainingId: 't1', epoch: 1, results: { val: { mean_iou: 0.2 } } },
        { trainingId: 't1', epoch: 2, results: { val: { mean_iou: 0.45 } } },
      ]);

      const { filename, tex } = await exportFindingAsLatex('f1', OWNER, {
        selectBy: 'val.mean_iou',
        direction: 'max',
      });

      expect(filename).toBe('window-ablation.tex');
      expect(tex).toContain('\\subsection{Window ablation}');
      expect(tex).toContain('window16 & 2 & 0.4500');
    }));

  it('does not read epochs of a cited run the caller cannot see', async () => {
    // Names are already withheld for these; their measurements must be too, or
    // the table becomes the side channel the name check just closed.
    finding.findOne.mockResolvedValue(row({ trainingIds: ['t1', 'hidden'] }));
    citedRunsAre([
      { _id: { toString: () => 't1' }, name: 'window16', projectId: 'p1' },
      { _id: { toString: () => 'hidden' }, name: 'secret', projectId: 'private' },
    ]);
    accessChecker.mockImplementation(() => async (p: string) => p === 'p1');

    const { tex } = await exportFindingAsLatex('f1', OWNER, {});

    expect(epoch.find.mock.calls[0][0].trainingId.$in).toEqual(['t1']);
    expect(tex).not.toContain('secret');
  });

  it('refuses to export one on a project the caller cannot see', async () => {
    finding.findOne.mockResolvedValue(row());
    access.mockResolvedValue(false);

    await expect(exportFindingAsLatex('f1', 'someone', {})).rejects.toThrow();
  });

  it('falls back to a usable filename when the title has no word characters', async () => {
    finding.findOne.mockResolvedValue(row({ title: '???' }));

    expect((await exportFindingAsLatex('f1', OWNER, {})).filename).toBe('finding.tex');
  });
});

describe('resolving a project', () => {
  it('prefers a slug, as every other project-scoped lookup does', async () => {
    project.findOne.mockResolvedValue({ _id: { toString: () => 'p-from-slug' } });
    listReturns([]);

    await listFindings(OWNER, { project: 'clftv2' });

    expect(project.findOne).toHaveBeenCalledWith({ slug: 'clftv2' });
    expect(finding.find.mock.calls[0][0].projectId).toBe('p-from-slug');
  });

  it('survives an identifier that is not a valid object id', async () => {
    // findById throws a CastError on a malformed id rather than returning null;
    // the caller should get "not found", not a 500.
    project.findById.mockRejectedValue(new Error('CastError'));

    await expect(listFindings(OWNER, { project: 'not-an-id' })).rejects.toThrow(/Project not found/);
  });
});

describe('createFinding', () => {
  it('records who wrote it and what it draws on', async () => {
    training.countDocuments.mockResolvedValue(2);
    finding.create.mockImplementation(async (doc: Record<string, unknown>) => asDoc(doc));

    const created = await createFinding(
      { project: 'p1', title: 'T', body: 'B', trainingIds: ['t1', 't2'] },
      author
    );

    expect(created).toMatchObject({
      projectId: 'p1',
      authorKind: 'assistant',
      authorLabel: 'Claude',
      authorUserId: OWNER,
      trainingIds: ['t1', 't2'],
    });
  });

  it('refuses to annotate a project the caller does not own', async () => {
    // Findings are the owner's record, not a comment section on public work.
    project.findById.mockResolvedValue({ _id: { toString: () => 'p1' }, ownerId: 'someone-else' });

    await expect(createFinding({ project: 'p1', title: 'T', body: 'B' }, author)).rejects.toThrow(
      /Project edit permission/
    );
    expect(finding.create).not.toHaveBeenCalled();
  });

  it('refuses a citation naming a run that does not exist', async () => {
    // An unverifiable citation defeats the reader who would want to check it.
    training.countDocuments.mockResolvedValue(1);

    await expect(
      createFinding({ project: 'p1', title: 'T', body: 'B', trainingIds: ['t1', 'ghost'] }, author)
    ).rejects.toThrow(/do not exist/);
  });

  it('treats a repeated citation as one run', async () => {
    training.countDocuments.mockResolvedValue(1);
    finding.create.mockImplementation(async (doc: Record<string, unknown>) => asDoc(doc));

    await expect(
      createFinding({ project: 'p1', title: 'T', body: 'B', trainingIds: ['t1', 't1'] }, author)
    ).resolves.toBeDefined();
  });

  it('cites the subject run when only that is given', async () => {
    training.countDocuments.mockResolvedValue(1);
    finding.create.mockImplementation(async (doc: Record<string, unknown>) => asDoc(doc));

    const created = await createFinding({ project: 'p1', training: 't1', title: 'T', body: 'B' }, author);

    expect(created).toMatchObject({ trainingId: 't1', trainingIds: ['t1'] });
  });

  it('cites the run it is about even when other runs are cited too', async () => {
    // Previously `trainingIds ?? [training]` meant giving both dropped the
    // subject: a finding about t1 comparing it with t2 and t3 listed the two it
    // was measured against and not the one it was about.
    training.countDocuments.mockResolvedValue(3);
    finding.create.mockImplementation(async (doc: Record<string, unknown>) => asDoc(doc));

    const created = await createFinding(
      { project: 'p1', training: 't1', title: 'T', body: 'B', trainingIds: ['t2', 't3'] },
      author
    );

    expect(created).toMatchObject({ trainingId: 't1', trainingIds: ['t1', 't2', 't3'] });
  });

  it('does not cite the subject twice when it is also listed', async () => {
    training.countDocuments.mockResolvedValue(2);
    finding.create.mockImplementation(async (doc: Record<string, unknown>) => asDoc(doc));

    const created = await createFinding(
      { project: 'p1', training: 't1', title: 'T', body: 'B', trainingIds: ['t1', 't2'] },
      author
    );

    expect(created).toMatchObject({ trainingIds: ['t1', 't2'] });
  });

  it('404s on a project that does not exist', async () => {
    project.findById.mockResolvedValue(null);

    await expect(createFinding({ project: 'nope', title: 'T', body: 'B' }, author)).rejects.toThrow(
      /Project not found/
    );
  });
});

describe('getFinding', () => {
  it('refuses one on a project the caller cannot see', async () => {
    finding.findOne.mockResolvedValue(row());
    access.mockResolvedValue(false);

    await expect(getFinding('f1', 'someone')).rejects.toThrow();
  });

  it('returns it when the project is visible', async () => {
    finding.findOne.mockResolvedValue(row());

    await expect(getFinding('f1', OWNER)).resolves.toMatchObject({ _id: 'f1' });
  });

  it('404s on a missing one', async () => {
    finding.findOne.mockResolvedValue(null);

    await expect(getFinding('nope', OWNER)).rejects.toThrow(/not found/);
  });
});

describe('deleteFinding', () => {
  it('soft-deletes, so a conclusion someone acted on can be recovered', async () => {
    const doc = row();
    finding.findOne.mockResolvedValue(doc);

    await deleteFinding('f1', OWNER);

    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
  });

  it('refuses anyone but the project owner', async () => {
    finding.findOne.mockResolvedValue(row());
    project.findById.mockResolvedValue({ ownerId: 'someone-else' });

    await expect(deleteFinding('f1', OWNER)).rejects.toThrow();
  });

  it('404s on a missing one', async () => {
    finding.findOne.mockResolvedValue(null);

    await expect(deleteFinding('nope', OWNER)).rejects.toThrow(/not found/);
  });
});
