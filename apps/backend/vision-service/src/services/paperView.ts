import { isValidObjectId } from 'mongoose';
import { atLeast, createOwnershipAccess, excerpt, type Permission, type ResourceOwner } from '@visin/backend-core';
import { type IPaper, type IPaperAuthor, type IPaperResult } from '../models/Paper';
import Suite from '../models/Suite';
import Training from '../models/Training';
import { lookupOwnerIdentities, type OwnerIdentity } from '../clients/ownerIdentityClient';
import { callerGroups } from './projectAccessService';
import { publicProjectsAmong, type ActivityProject } from './activityService';

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

interface Resolved {
  projects: Map<string, ActivityProject>;
  trainings: Map<string, { name: string }>;
  suites: Map<string, { name: string }>;
}

/** What is public right now among everything these papers cite: nothing is stored about it, so nothing goes stale. */
export async function resolveCited(papers: IPaper[]): Promise<Resolved> {
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

export const splitBoard = (ref: string): { slug: string; version: number } | undefined => {
  const at = ref.lastIndexOf('@');
  const version = Number(ref.slice(at + 1));
  return at > 0 && Number.isInteger(version) && version > 0 ? { slug: ref.slice(0, at), version } : undefined;
};

/** The name of what a result points at, if it is public now: its project must be public and live too. */
export function publicName(result: IPaperResult, found: Resolved): string | undefined {
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

export async function toCards(papers: IPaper[], viewerId: string | undefined): Promise<PaperCard[]> {
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

export async function toView(paper: IPaper, viewerId: string | undefined): Promise<PaperView> {
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
