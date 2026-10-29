import { isValidObjectId, type QueryFilter } from 'mongoose';
import { atLeast, BadRequestError, createOwnershipAccess, ForbiddenError, NotFoundError, UnauthorizedError, type Permission, type ResourceOwner } from '@visin/backend-core';
import Paper, { type IPaper, type IPaperAuthor, type IPaperResult } from '../models/Paper';
import Suite from '../models/Suite';
import Training from '../models/Training';
import { lookupOwnerIdentities } from '../clients/ownerIdentityClient';
import { requireUserCredential } from '../middleware/projectTokenContext';
import type { CreatePaperBody, MyPapersQuery, PublicPapersQuery, UpdatePaperBody } from '../validation/paperSchemas';
import { callerGroups, checkProjectAccess, projectPermission, resolveProject } from './projectAccessService';
import { parseArxivId, parseDoi } from './paperIdentifiers';
import { PaperCard, PaperView, resolveCited, splitBoard, publicName, toCards, toView } from './paperView';

// The service's public surface stays here, whichever file a piece now lives in.
export type { PaperAuthorView, PaperResultView, PaperPermissions, PaperCard, PaperView } from './paperView';

/** The papers one person's own list returns at most: nobody has more than this, and it is not a paged list. */
const OWN_LIST_LIMIT = 200;

// ── what a paper cites ─────────────────────────────────────────────────────────────────────────────────────────

// ── building what is returned ─────────────────────────────────────────────────────────────────────────────────

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

