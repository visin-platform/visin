import { isValidObjectId, type QueryFilter } from 'mongoose';
import {
  atLeast,
  BadRequestError,
  createOwnershipAccess,
  excerpt,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  type Permission,
  type ResourceOwner
} from '@visin/backend-core';
import Paper, { type IPaper, type IPaperAuthor, type IPaperResult } from '../models/Paper';
import Suite from '../models/Suite';
import Training from '../models/Training';
import { lookupOwnerIdentities, type OwnerIdentity } from '../clients/ownerIdentityClient';
import { requireUserCredential } from '../middleware/projectTokenContext';
import type {
  CreatePaperBody,
  MyPapersQuery,
  PublicPapersQuery,
  UpdatePaperBody
} from '../validation/paperSchemas';
import { callerGroups, checkProjectAccess, projectPermission, resolveProject } from './projectAccessService';
import { publicProjectsAmong, type ActivityProject } from './activityService';
import { parseArxivId, parseDoi } from './paperIdentifiers';

type Identity = Partial<Omit<OwnerIdentity, 'id'>>;

/** One name on the author list. `user` is present only where the account behind it stands behind the link. */
export interface PaperAuthorView {
  name: string;
  /** `confirmed`: the person accepted. `pending`: named, not yet accepted; only the paper's managers and that person see it. */
  status?: 'confirmed' | 'pending';
  user?: Identity & { id: string };
}

/**
 * What a paper cites, as the reader may see it. A result that is no longer public reads `available: false` and
 * carries nothing about what it was, except for the paper's managers, who need to see what to fix.
 */
export interface PaperResultView {
  kind: IPaperResult['kind'];
  available: boolean;
  ref?: string;
  name?: string;
  note?: string;
  /** the project a run or a leaderboard belongs to, where it is available */
  project?: ActivityProject;
}

export interface PaperPermissions {
  read: boolean;
  contribute: boolean;
  manage: boolean;
  own: boolean;
}

interface PaperBase {
  id: string;
  title: string;
  authors: PaperAuthorView[];
  venue?: string;
  year?: number;
  arxivId?: string;
  doi?: string;
  tags: string[];
  owner: ResourceOwner & Identity;
  visibility: IPaper['visibility'];
  createdAt: string;
  updatedAt: string;
  trashedAt?: string;
  /** what the caller may do with it; absent for the anonymous public catalogue */
  permissions?: PaperPermissions;
}

/** A paper as a list shows it: the abstract cut short, and how many of its results are still public. */
export interface PaperCard extends PaperBase {
  abstract?: string;
  results: { cited: number; available: number };
}

/** A whole paper. */
export interface PaperView extends PaperBase {
  abstract?: string;
  url?: string;
  pdfUrl?: string;
  results: PaperResultView[];
}

const permissionsOf = (permission: Permission): PaperPermissions => ({
  read: atLeast(permission, 'read'),
  contribute: atLeast(permission, 'contribute'),
  manage: atLeast(permission, 'manage'),
  own: atLeast(permission, 'own')
});

const ABSTRACT_CARD = 300;
/** The papers one person's own list returns at most: nobody has more than this, and it is not a paged list. */
const OWN_LIST_LIMIT = 200;

// ── what a paper cites ─────────────────────────────────────────────────────────────────────────────────────────

interface Resolved {
  projects: Map<string, ActivityProject>;
  trainings: Map<string, { name: string }>;
  suites: Map<string, { name: string }>;
}

/** What is public right now among everything these papers cite: nothing is stored about it, so nothing goes stale. */
async function resolveCited(papers: IPaper[]): Promise<Resolved> {
  const results = papers.flatMap((paper) => paper.results);
  const trainingIds = [...new Set(results.filter((r) => r.kind === 'training').map((r) => r.ref))].filter((id) => isValidObjectId(id));
  const boards = results
    .filter((r) => r.kind === 'leaderboard')
    .map((r) => splitBoard(r.ref))
    .filter((board): board is { slug: string; version: number } => board !== undefined);

  const [projects, trainings, suites] = await Promise.all([
    publicProjectsAmong(results.map((r) => r.projectId)),
    trainingIds.length ? Training.find({ _id: { $in: trainingIds }, deletedAt: null }).select('name').lean() : [],
    boards.length
      ? Suite.find({ visibility: 'public', $or: boards.map(({ slug, version }) => ({ slug, version })) }).select('slug version name').lean()
      : []
  ]);
  return {
    projects,
    trainings: new Map(trainings.map((training) => [String(training._id), { name: training.name }])),
    suites: new Map(suites.map((suite) => [`${suite.slug}@${suite.version}`, { name: suite.name }]))
  };
}

const splitBoard = (ref: string): { slug: string; version: number } | undefined => {
  const at = ref.lastIndexOf('@');
  const version = Number(ref.slice(at + 1));
  return at > 0 && Number.isInteger(version) && version > 0 ? { slug: ref.slice(0, at), version } : undefined;
};

/** The name of what a result points at, if it is public now: its project must be public and live too. */
function publicName(result: IPaperResult, found: Resolved): string | undefined {
  if (!found.projects.has(result.projectId)) return undefined;
  if (result.kind === 'project') return found.projects.get(result.projectId)!.name;
  if (result.kind === 'training') return found.trainings.get(result.ref)?.name;
  return found.suites.get(result.ref)?.name;
}

const toResultView = (result: IPaperResult, found: Resolved, manager: boolean): PaperResultView => {
  const name = publicName(result, found);
  const project = found.projects.get(result.projectId);
  return {
    kind: result.kind,
    available: name !== undefined,
    ...(name !== undefined || manager ? { ref: result.ref } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(name !== undefined && result.kind !== 'project' && project ? { project } : {}),
    ...(result.note ? { note: result.note } : {})
  };
};

// ── building what is returned ─────────────────────────────────────────────────────────────────────────────────

interface Context {
  viewerId?: string;
  identities: Map<string, OwnerIdentity>;
  found: Resolved;
  permission: (paper: IPaper) => Promise<Permission>;
}

/** Everything a page of papers needs from other places, asked for once: who the people are, and what is still public. */
async function contextFor(papers: IPaper[], viewerId: string | undefined): Promise<Context> {
  const people = papers.flatMap((paper) => paper.authors.flatMap((author) => (author.userId ? [{ kind: 'user' as const, id: author.userId }] : [])));
  const [identities, found] = await Promise.all([
    lookupOwnerIdentities([...papers.map((paper) => paper.owner), ...people]),
    resolveCited(papers)
  ]);
  const access = createOwnershipAccess(viewerId, callerGroups);
  return { viewerId, identities, found, permission: (paper) => access.permission(paper) };
}

const shown = (identities: Map<string, OwnerIdentity>, id: string): Identity => {
  const { id: _id, ...rest } = identities.get(id) ?? { id };
  return rest;
};

function toAuthorView(author: IPaperAuthor, ctx: Context, manager: boolean): PaperAuthorView {
  if (!author.userId) return { name: author.name };
  const confirmed = Boolean(author.confirmedAt);
  // A name that has not agreed to be linked is just a name to everyone but the paper's managers and that person.
  if (!confirmed && !manager && ctx.viewerId !== author.userId) return { name: author.name };
  return {
    name: author.name,
    status: confirmed ? 'confirmed' : 'pending',
    user: { id: author.userId, ...shown(ctx.identities, author.userId) }
  };
}

async function toBase(paper: IPaper, ctx: Context): Promise<{ base: PaperBase; manager: boolean }> {
  const permission = await ctx.permission(paper);
  const manager = atLeast(permission, 'manage');
  return {
    manager,
    base: {
      id: String(paper._id),
      title: paper.title,
      authors: paper.authors.map((author) => toAuthorView(author, ctx, manager)),
      ...(paper.venue ? { venue: paper.venue } : {}),
      ...(paper.year ? { year: paper.year } : {}),
      ...(paper.arxivId ? { arxivId: paper.arxivId } : {}),
      ...(paper.doi ? { doi: paper.doi } : {}),
      tags: paper.tags,
      owner: { kind: paper.owner.kind, id: paper.owner.id, ...shown(ctx.identities, paper.owner.id) },
      visibility: paper.visibility,
      createdAt: paper.createdAt.toISOString(),
      updatedAt: paper.updatedAt.toISOString(),
      ...(paper.trashedAt ? { trashedAt: paper.trashedAt.toISOString() } : {}),
      ...(ctx.viewerId ? { permissions: permissionsOf(permission) } : {})
    }
  };
}

async function toCards(papers: IPaper[], viewerId: string | undefined): Promise<PaperCard[]> {
  const ctx = await contextFor(papers, viewerId);
  return Promise.all(
    papers.map(async (paper) => {
      const { base, manager } = await toBase(paper, ctx);
      const views = paper.results.map((result) => toResultView(result, ctx.found, manager));
      return {
        ...base,
        ...(paper.abstract ? { abstract: excerpt(paper.abstract, ABSTRACT_CARD) } : {}),
        results: { cited: views.length, available: views.filter((view) => view.available).length }
      };
    })
  );
}

async function toView(paper: IPaper, viewerId: string | undefined): Promise<PaperView> {
  const ctx = await contextFor([paper], viewerId);
  const { base, manager } = await toBase(paper, ctx);
  return {
    ...base,
    ...(paper.abstract ? { abstract: paper.abstract } : {}),
    ...(paper.url ? { url: paper.url } : {}),
    ...(paper.pdfUrl ? { pdfUrl: paper.pdfUrl } : {}),
    results: paper.results.map((result) => toResultView(result, ctx.found, manager))
  };
}

// ── reading ───────────────────────────────────────────────────────────────────────────────────────────────────

const pagination = (page: number, limit: number, total: number) => ({ page, limit, total, pages: Math.ceil(total / limit) });

/** A search term that is an identifier finds that paper however it was written; any other is a text search. */
const searchClause = (search: string): QueryFilter<IPaper> => {
  const arxivId = parseArxivId(search);
  if (arxivId) return { arxivId };
  const doi = parseDoi(search);
  return doi ? { doi } : { $text: { $search: search } };
};

/**
 * The public papers, paged and the same for everyone who asks: a signed-in author's drafts never mix in. A person's
 * list holds only the papers they have confirmed they wrote, so nobody's page can be filled by someone else naming them.
 */
export async function listPublicPapers({ search, user, project, sort, page, limit }: PublicPapersQuery) {
  const filter: QueryFilter<IPaper> = {
    visibility: 'public',
    trashedAt: null,
    ...(user ? { authors: { $elemMatch: { userId: user, confirmedAt: { $exists: true } } } } : {}),
    ...(project ? { projectIds: project } : {}),
    ...(search ? searchClause(search) : {})
  };
  const [papers, total] = await Promise.all([
    Paper.find(filter)
      .sort(sort === 'year' ? { year: -1, createdAt: -1, _id: -1 } : { createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Paper.countDocuments(filter)
  ]);
  return { papers: await toCards(papers, undefined), pagination: pagination(page, limit, total) };
}

/** The caller's own papers, drafts included (a group's too, to its members), or what they have in the trash. */
export async function listMyPapers(userId: string, { scope }: MyPapersQuery): Promise<PaperCard[]> {
  const access = createOwnershipAccess(userId, callerGroups);
  const trash = scope === 'trash';
  const papers = await Paper.find({
    $and: [await access.filter(trash ? 'manage' : 'contribute'), { trashedAt: trash ? { $ne: null } : null }]
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(OWN_LIST_LIMIT);
  return toCards(papers, userId);
}

/** The paper, when the caller may do at least `min` with it: 404 when they may not even read it, so a draft is not confirmed. */
async function requirePaper(id: string, userId: string | undefined, min: Permission = 'read'): Promise<IPaper> {
  const paper = isValidObjectId(id) ? await Paper.findById(id) : null;
  if (!paper || paper.trashedAt) throw new NotFoundError('Paper not found');
  const permission = await createOwnershipAccess(userId, callerGroups).permission(paper);
  if (!atLeast(permission, 'read')) throw new NotFoundError('Paper not found');
  if (!atLeast(permission, min)) {
    if (!userId) throw new UnauthorizedError('Authentication required');
    throw new ForbiddenError(`This needs ${min} permission on the paper`);
  }
  return paper;
}

export const getPaper = async (id: string, userId: string | undefined): Promise<PaperView> => toView(await requirePaper(id, userId), userId);

/** The public papers that name this person and wait for them to say yes: what they are asked to confirm. */
export async function listAuthorshipRequests(userId: string): Promise<PaperCard[]> {
  const papers = await Paper.find({
    visibility: 'public',
    trashedAt: null,
    authors: { $elemMatch: { userId, confirmedAt: { $exists: false } } }
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(50);
  return toCards(papers, userId);
}

// ── writing ───────────────────────────────────────────────────────────────────────────────────────────────────

type AuthorInput = { name: string; userId?: string };
type ResultInput = { kind: IPaperResult['kind']; ref: string; note?: string };

/**
 * The author list as stored. An account stays confirmed if it already was; the person who writes the list may link
 * themselves, which needs no one's say-so; any other account waits for its owner. Nobody can be linked who turned the
 * link down, and every linked account must exist.
 */
async function buildAuthors(actorId: string, input: AuthorInput[], existing: IPaper | null): Promise<IPaperAuthor[]> {
  const held = new Map((existing?.authors ?? []).flatMap((author) => (author.userId ? [[author.userId, author] as const] : [])));
  const added = input.flatMap((author) => (author.userId && !held.has(author.userId) ? [author.userId] : []));
  const declined = new Set(existing?.declinedUserIds ?? []);
  if (added.some((id) => declined.has(id))) throw new BadRequestError('That person declined to be linked to this paper');
  if (added.length > 0) {
    const known = await lookupOwnerIdentities(added.map((id) => ({ kind: 'user' as const, id })));
    if (added.some((id) => !known.has(id))) throw new BadRequestError('One of the linked accounts does not exist');
  }
  return input.map((author): IPaperAuthor => {
    if (!author.userId) return { name: author.name };
    const confirmedAt = held.get(author.userId)?.confirmedAt ?? (author.userId === actorId ? new Date() : undefined);
    return { name: author.name, userId: author.userId, ...(confirmedAt ? { confirmedAt } : {}) };
  });
}

const cannotFind = (what: string) => new BadRequestError(`Could not find ${what} that you can see`);

/** A result the caller names, checked to exist and to be theirs to read, and reduced to what is stored. */
async function resolveResult(userId: string, input: ResultInput): Promise<Pick<IPaperResult, 'ref' | 'projectId'>> {
  if (input.kind === 'project') {
    const project = await resolveProject(input.ref);
    if (!project || project.trashedAt || !atLeast(await projectPermission(project, userId), 'read')) throw cannotFind(`the project "${input.ref}"`);
    const id = String(project._id);
    return { ref: id, projectId: id };
  }
  if (input.kind === 'training') {
    const training = isValidObjectId(input.ref) ? await Training.findOne({ _id: input.ref, deletedAt: null }).select('projectId') : null;
    if (!training?.projectId || !(await checkProjectAccess(userId, training.projectId))) throw cannotFind(`the run "${input.ref}"`);
    return { ref: String(training._id), projectId: training.projectId };
  }
  const board = splitBoard(input.ref);
  const suite = board ? await Suite.findOne(board).select('projectId') : null;
  if (!board || !suite || !(await checkProjectAccess(userId, suite.projectId))) throw cannotFind(`the leaderboard "${input.ref}"`);
  return { ref: `${board.slug}@${board.version}`, projectId: suite.projectId };
}

/**
 * What a paper cites, as stored. What it already cited is kept as it was, so a collaborator who cannot read one of the
 * results can still edit the paper around it; only what is new is checked against what the caller may read.
 */
async function buildResults(userId: string, input: ResultInput[], existing: IPaperResult[]): Promise<IPaperResult[]> {
  const held = new Map(existing.map((result) => [`${result.kind}:${result.ref}`, result]));
  const kept = new Map<string, IPaperResult>();
  for (const item of input) {
    const prior = held.get(`${item.kind}:${item.ref}`);
    const { ref, projectId } = prior ?? (await resolveResult(userId, item));
    const key = `${item.kind}:${ref}`;
    if (!kept.has(key)) kept.set(key, { kind: item.kind, ref, projectId, ...(item.note ? { note: item.note } : {}) });
  }
  return [...kept.values()];
}

/**
 * A public paper is findable, and cites something to find: a way to the paper itself, and at least one result that
 * anyone can open right now. Otherwise the catalogue would fill with links that lead nowhere on Visin.
 */
async function assertPublishable(paper: IPaper, checkResults: boolean): Promise<void> {
  if (!paper.arxivId && !paper.doi && !paper.url) throw new BadRequestError('A public paper needs an arXiv id, a DOI or a link to the paper');
  if (paper.results.length === 0) throw new BadRequestError('A public paper must cite at least one result on Visin');
  if (!checkResults) return;
  const found = await resolveCited([paper]);
  if (!paper.results.some((result) => publicName(result, found) !== undefined)) {
    throw new BadRequestError('A public paper must cite at least one result that is public on Visin');
  }
}

/** A new paper belongs to the caller, or to a group they are in; making a group's paper public takes its owner. */
export async function createPaper(userId: string, body: CreatePaperBody): Promise<PaperView> {
  requireUserCredential();
  const owner: ResourceOwner = body.owner ?? { kind: 'user', id: userId };
  if (owner.kind === 'user' && owner.id !== userId) throw new ForbiddenError('A paper can belong to you or to one of your groups');
  if (owner.kind === 'group') {
    const { member, role } = await callerGroups.checkMembership(owner.id, userId);
    if (!member) throw new ForbiddenError('You can only add a paper to a group you belong to');
    if (body.visibility === 'public' && role !== 'owner') throw new ForbiddenError("Only the group's owner can make its papers public");
  }
  const results = await buildResults(userId, body.results, []);
  const paper = new Paper({
    title: body.title,
    abstract: body.abstract || undefined,
    authors: await buildAuthors(userId, body.authors, null),
    venue: body.venue || undefined,
    year: body.year,
    arxivId: body.arxivId,
    doi: body.doi,
    url: body.url,
    pdfUrl: body.pdfUrl,
    tags: [...new Set(body.tags)],
    results,
    projectIds: [...new Set(results.map((result) => result.projectId))],
    owner,
    createdBy: userId,
    visibility: body.visibility
  });
  if (paper.visibility === 'public') await assertPublishable(paper, true);
  await paper.save();
  return toView(paper, userId);
}

/** Changing a paper needs `manage`; who can see it needs `own`. */
export async function updatePaper(id: string, userId: string, body: UpdatePaperBody): Promise<PaperView> {
  requireUserCredential();
  const paper = await requirePaper(id, userId, 'manage');
  const makesPublic = body.visibility === 'public' && paper.visibility !== 'public';
  if (body.visibility !== undefined && body.visibility !== paper.visibility) {
    const permission = await createOwnershipAccess(userId, callerGroups).permission(paper);
    if (!atLeast(permission, 'own')) throw new ForbiddenError('Only the paper’s owner can change who can see it');
    paper.visibility = body.visibility;
  }

  if (body.title !== undefined) paper.title = body.title;
  if (body.abstract !== undefined) paper.abstract = body.abstract || undefined;
  if (body.venue !== undefined) paper.venue = body.venue || undefined;
  if (body.year !== undefined) paper.year = body.year ?? undefined;
  if (body.arxivId !== undefined) paper.arxivId = body.arxivId ?? undefined;
  if (body.doi !== undefined) paper.doi = body.doi ?? undefined;
  if (body.url !== undefined) paper.url = body.url ?? undefined;
  if (body.pdfUrl !== undefined) paper.pdfUrl = body.pdfUrl ?? undefined;
  if (body.tags !== undefined) paper.tags = [...new Set(body.tags)];
  if (body.authors !== undefined) paper.authors = await buildAuthors(userId, body.authors, paper);
  if (body.results !== undefined) {
    paper.results = await buildResults(userId, body.results, paper.results);
    paper.projectIds = [...new Set(paper.results.map((result) => result.projectId))];
  }

  // What must hold of a public paper is checked on whatever it will be, whichever field this edit touched.
  if (paper.visibility === 'public') await assertPublishable(paper, makesPublic || body.results !== undefined);
  await paper.save();
  return toView(paper, userId);
}

/** Into the trash, restorable by its owner for 30 days. */
export async function trashPaper(id: string, userId: string): Promise<void> {
  requireUserCredential();
  const paper = await requirePaper(id, userId, 'manage');
  paper.trashedAt = new Date();
  await paper.save();
}

export async function restorePaper(id: string, userId: string): Promise<PaperView> {
  requireUserCredential();
  const paper = isValidObjectId(id) ? await Paper.findOne({ _id: id, trashedAt: { $ne: null } }) : null;
  const permission = paper ? await createOwnershipAccess(userId, callerGroups).permission(paper) : 'none';
  if (!paper || !atLeast(permission, 'manage')) throw new NotFoundError('No such paper in the trash');
  if (!atLeast(permission, 'own')) throw new ForbiddenError("Only the paper's owner can restore it");
  paper.trashedAt = undefined;
  await paper.save();
  return toView(paper, userId);
}

/**
 * A person's answer to being named as an author: `true` confirms the link between that name on a public paper and
 * their account (it then appears on their page), `false` removes it, now or later, and keeps the paper's owner from
 * linking them again.
 */
export async function setAuthorship(id: string, userId: string, linked: boolean): Promise<{ id: string; linked: boolean }> {
  requireUserCredential();
  const paper = isValidObjectId(id) ? await Paper.findOne({ _id: id, trashedAt: null, 'authors.userId': userId }) : null;
  if (!paper || (linked && paper.visibility !== 'public')) throw new NotFoundError('No paper names you as an author');
  const entry = paper.authors.find((author) => author.userId === userId)!;
  if (linked) {
    entry.confirmedAt ??= new Date();
  } else {
    entry.userId = undefined;
    entry.confirmedAt = undefined;
    paper.declinedUserIds = [...new Set([...paper.declinedUserIds, userId])];
  }
  paper.markModified('authors');
  await paper.save();
  return { id, linked };
}
