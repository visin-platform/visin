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
  default: { countDocuments: jest.fn() },
}));
jest.mock('../../services/projectAccessService', () => ({ checkProjectAccess: jest.fn() }));

import Finding from '../../models/Finding';
import Project from '../../models/Project';
import Training from '../../models/Training';
import { checkProjectAccess } from '../../services/projectAccessService';
import {
  createFinding,
  deleteFinding,
  getFinding,
  listFindings,
} from '../../services/findingService';

const finding = Finding as unknown as Record<string, jest.Mock>;
const project = Project as unknown as Record<string, jest.Mock>;
const training = Training as unknown as Record<string, jest.Mock>;
const access = checkProjectAccess as unknown as jest.Mock;

const OWNER = 'u1';
const author = { kind: 'assistant' as const, label: 'Claude', userId: OWNER };

const row = (over: Record<string, unknown> = {}) => ({
  _id: 'f1',
  projectId: 'p1',
  title: 'Window ablation',
  body: 'window16 beats window24 on ZOD but not WAYMO.',
  trainingIds: [],
  deletedAt: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...over,
});

const listReturns = (rows: unknown[]) => {
  const limit = jest.fn().mockResolvedValue(rows);
  finding.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ limit }) });
  return limit;
};

beforeEach(() => {
  jest.clearAllMocks();
  access.mockResolvedValue(true);
  project.findOne.mockResolvedValue(null);
  project.findById.mockResolvedValue({ _id: { toString: () => 'p1' }, ownerId: OWNER });
  training.countDocuments.mockResolvedValue(0);
});

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

  it('filters an unscoped listing row by row, so it is not a way around privacy', async () => {
    // With no project filter the query cannot be bounded up front.
    listReturns([row({ projectId: 'mine' }), row({ _id: 'f2', projectId: 'someone-elses' })]);
    access.mockImplementation(async (_u: string, p: string) => p === 'mine');

    const visible = await listFindings(OWNER, {});

    expect(visible).toHaveLength(1);
    expect(visible[0].projectId).toBe('mine');
  });

  it('caps how many rows one request can pull', async () => {
    const limit = listReturns([]);

    await listFindings(OWNER, { limit: 9999 });

    expect(limit).toHaveBeenCalledWith(200);
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
    finding.create.mockImplementation(async (doc: unknown) => doc);

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
      /Only the project owner/
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
    finding.create.mockImplementation(async (doc: unknown) => doc);

    await expect(
      createFinding({ project: 'p1', title: 'T', body: 'B', trainingIds: ['t1', 't1'] }, author)
    ).resolves.toBeDefined();
  });

  it('cites the subject run when only that is given', async () => {
    training.countDocuments.mockResolvedValue(1);
    finding.create.mockImplementation(async (doc: unknown) => doc);

    const created = await createFinding({ project: 'p1', training: 't1', title: 'T', body: 'B' }, author);

    expect(created).toMatchObject({ trainingId: 't1', trainingIds: ['t1'] });
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
