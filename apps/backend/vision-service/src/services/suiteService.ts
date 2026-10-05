import {
  atLeast,
  canChangeItem,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  recordResourceEvent,
  UnauthorizedError,
  type Permission
} from '@visin/backend-core';
import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import Project from '../models/Project';
import Suite, { type ISuite } from '../models/Suite';
import { tokenProjectId } from '../middleware/projectTokenContext';
import type { CheckSuiteBody, CreateSuiteBody, ListSuitesQuery, SuiteProtocol, UpdateSuiteBody } from '../validation/suiteSchemas';
import { getVisibleProjectIds, isWithinTokenScope, permissionIgnoringKeyLimit, projectPermission, resolveProject } from './projectAccessService';
import { normalizeProtocol, protocolDigest } from './suiteProtocol';
import { reserveSuiteSlug } from './suiteSlugService';
import { invalidatePublic } from './publicCache';
import { clearPublications } from './publications';
import { dataTermsView, type DataTermsView } from './suiteDataTerms';

const MAX_PAGE = 100;

export interface SuiteView {
  _id: string;
  slug: string;
  version: number;
  name: string;
  description?: string;
  projectId: string;
  visibility: 'private' | 'public';
  submissions: ISuite['submissions'];
  dataTerms?: DataTermsView;
  createdBy: string;
  protocol: ISuite['protocol'];
  digest: string;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const toView = (suite: ISuite): SuiteView => ({
  _id: suite._id.toString(),
  slug: suite.slug,
  version: suite.version,
  name: suite.name,
  ...(suite.description ? { description: suite.description } : {}),
  projectId: suite.projectId,
  visibility: suite.visibility,
  submissions: suite.submissions ?? 'open',
  ...(suite.dataTerms ? { dataTerms: dataTermsView(suite.dataTerms) } : {}),
  createdBy: suite.createdBy,
  protocol: suite.protocol,
  digest: suite.digest,
  ...(suite.archivedAt ? { archivedAt: suite.archivedAt } : {}),
  createdAt: suite.createdAt,
  updatedAt: suite.updatedAt
});

const requireActor = (userId: string | undefined): string => {
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
};

/** The project's permission for the caller, or `none` once it is trashed or out of the credential's reach. */
export async function permissionOnSuiteProject(suite: Pick<ISuite, 'projectId'>, userId: string | undefined): Promise<Permission> {
  if (!isValidObjectId(suite.projectId)) return 'none';
  const project = await Project.findById(suite.projectId);
  return projectPermission(project, userId);
}

/**
 * Whether the caller may read a suite: anyone, for a public suite whose project is live, and otherwise whoever may
 * read its project. A public suite is a protocol to read and run; it grants nothing in its project.
 */
export async function canReadSuite(suite: ISuite, userId: string | undefined): Promise<boolean> {
  if (!isValidObjectId(suite.projectId)) return false;
  const project = await Project.findById(suite.projectId).select('trashedAt');
  if (!project || project.trashedAt) return false;
  if (suite.visibility === 'public') return true;
  return atLeast(await permissionOnSuiteProject(suite, userId), 'read');
}

/** A suite that exists and that the caller may read; otherwise the same not-found, so a private one is not confirmed. */
export async function readableSuite(slug: string, version: number | 'latest', userId: string | undefined): Promise<ISuite> {
  const suite =
    version === 'latest'
      ? await Suite.findOne({ slug, archivedAt: null }).sort({ version: -1 })
      : await Suite.findOne({ slug, version });
  if (!suite || !(await canReadSuite(suite, userId))) throw new NotFoundError('Suite not found');
  return suite;
}

/** The suites the caller may list: those of projects they can read, and the public ones of live projects. */
async function readableFilter(userId: string | undefined): Promise<QueryFilter<ISuite>> {
  const visible = await getVisibleProjectIds(userId);
  const publicProjectIds = (await Suite.distinct('projectId', { visibility: 'public' })).filter(id => isValidObjectId(id));
  const live = publicProjectIds.length
    ? (await Project.find({ _id: { $in: publicProjectIds.map(id => new Types.ObjectId(id)) }, trashedAt: null }).select('_id')).map(project =>
        project._id.toString()
      )
    : [];
  // A credential limited to one project lists that project's suites and public ones, as an anonymous caller would.
  const scope = tokenProjectId();
  const own = scope ? visible.filter(id => id === scope) : visible;
  return { $or: [{ projectId: { $in: own } }, { visibility: 'public', projectId: { $in: live } }] };
}

export async function listSuites(userId: string | undefined, query: ListSuitesQuery) {
  const clauses: QueryFilter<ISuite>[] = [await readableFilter(userId)];
  if (query.slug) clauses.push({ slug: query.slug });
  if (query.projectId) {
    const project = await resolveProject(query.projectId);
    clauses.push({ projectId: project ? project._id.toString() : '' });
  }
  if (!query.includeArchived) clauses.push({ archivedAt: null });
  const filter: QueryFilter<ISuite> = { $and: clauses };

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 30, MAX_PAGE);
  const [total, suites] = await Promise.all([
    Suite.countDocuments(filter),
    Suite.find(filter)
      .sort({ slug: 1, version: query.order })
      .skip((page - 1) * limit)
      .limit(limit)
  ]);
  return { suites: suites.map(toView), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getSuite(slug: string, version: number | 'latest', userId: string | undefined): Promise<SuiteView> {
  return toView(await readableSuite(slug, version, userId));
}

const sameProtocol = (existing: ISuite, digest: string) => existing.digest === digest;

/**
 * The digest of a protocol, without storing it, so an evaluator can record the digest of the file it actually ran
 * as evidence. The server alone canonicalizes (defaults filled in, keys sorted), so no client reimplements it.
 */
export function checkSuiteProtocol(userId: string | undefined, body: CheckSuiteBody): { digest: string; protocol: SuiteProtocol } {
  requireActor(userId);
  return { digest: protocolDigest(body.protocol), protocol: normalizeProtocol(body.protocol) };
}

/**
 * Publish a suite version. Idempotent for the same protocol, so a retried push or a re-run of a pipeline's setup
 * script is harmless; a different protocol under a taken (slug, version) is refused, because the version is what
 * tells a reader two scores can be compared.
 */
export async function createSuite(userId: string | undefined, body: CreateSuiteBody): Promise<{ suite: SuiteView; created: boolean }> {
  const actor = requireActor(userId);
  const project = await resolveProject(body.projectId);
  const projectId = project?._id.toString();
  // Not found and not permitted read the same, so a private project's existence is not confirmed to a stranger,
  // including one holding a credential limited to a different project; only then does the credential's own limit speak.
  if (!project || !projectId || !atLeast(await permissionIgnoringKeyLimit(project, actor), 'read')) throw new NotFoundError('Project not found');
  if (!isWithinTokenScope(undefined, projectId)) throw new ForbiddenError('A credential limited to one project cannot publish a suite to another');
  const permission = await projectPermission(project, actor);
  if (!atLeast(permission, 'contribute')) throw new ForbiddenError('Contribute access to the project is required to publish a suite');

  const digest = protocolDigest(body.protocol);

  const existing = await Suite.findOne({ slug: body.slug, version: body.version });
  if (existing) {
    const resolved = await resolveExisting(existing, projectId, digest);
    await reserveSuiteSlug(body.slug, projectId);
    return { suite: toView(resolved), created: false };
  }

  const earlier = await Suite.findOne({ slug: body.slug }).sort({ version: -1 }).select('projectId visibility submissions');
  if (earlier && earlier.projectId !== projectId) {
    throw new ConflictError(`The suite name "${body.slug}" belongs to another project; choose another`);
  }

  // Sharing a new protocol needs manage even when its public visibility is inherited.
  // Existing-version retries above return the stored suite without changing its visibility.
  const visibility = body.visibility ?? earlier?.visibility ?? 'private';
  if (visibility === 'public' && !atLeast(permission, 'manage')) {
    throw new ForbiddenError('Manage access to the project is required to create a public suite');
  }

  await reserveSuiteSlug(body.slug, projectId);
  try {
    const suite = await Suite.create({
      slug: body.slug,
      version: body.version,
      name: body.name,
      description: body.description,
      projectId,
      // A new version inherits the highest existing version's visibility; a first one is private.
      visibility,
      submissions: body.submissions ?? earlier?.submissions ?? 'open',
      dataTerms: body.dataTerms,
      createdBy: actor,
      protocol: body.protocol,
      digest
    });
    if (visibility === 'public') {
      recordResourceEvent({
        service: 'vision-service',
        resourceType: 'suite',
        resourceId: suite._id.toString(),
        resourceName: `${suite.slug}@${suite.version}`,
        action: 'visibility',
        actorId: actor,
        owner: project.owner,
        visibility
      });
    }
    invalidatePublic();
    return { suite: toView(suite), created: true };
  } catch (error) {
    // A concurrent publish of the same version won the unique index: answer as if we had read it first.
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await Suite.findOne({ slug: body.slug, version: body.version });
    if (!winner) throw error;
    return { suite: toView(await resolveExisting(winner, projectId, digest)), created: false };
  }
}

async function resolveExisting(existing: ISuite, projectId: string, digest: string): Promise<ISuite> {
  if (existing.projectId !== projectId) throw new ConflictError(`The suite name "${existing.slug}" belongs to another project; choose another`);
  if (!sameProtocol(existing, digest)) {
    throw new ConflictError(
      `${existing.slug} version ${existing.version} already exists with a different protocol. A published version never changes: publish it as version ${existing.version + 1}.`
    );
  }
  return existing;
}

/**
 * Rename, reword, correct what is declared about the data, change visibility, or archive/unarchive. The protocol is not here: it cannot change. Archiving
 * stops new evaluations and keeps everything already recorded readable. Needs `manage`, or `contribute` on a suite
 * the caller published.
 */
export async function updateSuite(slug: string, version: number, userId: string | undefined, body: UpdateSuiteBody): Promise<SuiteView> {
  const actor = requireActor(userId);
  const suite = await readableSuite(slug, version, actor);
  if (!isWithinTokenScope(undefined, suite.projectId)) throw new ForbiddenError('A credential limited to one project cannot change another project\'s suite');
  const permission = await permissionOnSuiteProject(suite, actor);
  if (!canChangeItem(permission, suite.createdBy, actor)) throw new ForbiddenError('Write permission is required for this suite');
  if (body.visibility !== undefined && !atLeast(permission, 'manage')) {
    throw new ForbiddenError('Manage access to the project is required to change who can see a suite');
  }
  if (body.submissions !== undefined && !atLeast(permission, 'manage')) {
    throw new ForbiddenError('Manage access to the project is required to change who may publish results to a suite');
  }

  const before = suite.visibility;
  if (body.name !== undefined) suite.name = body.name;
  if (body.description !== undefined) suite.description = body.description === null ? undefined : body.description;
  if (body.visibility !== undefined) suite.visibility = body.visibility;
  if (body.submissions !== undefined) suite.submissions = body.submissions;
  if (body.dataTerms !== undefined) suite.dataTerms = body.dataTerms ?? undefined;
  if (body.archived !== undefined) suite.archivedAt = body.archived ? (suite.archivedAt ?? new Date()) : undefined;
  await suite.save();
  // A suite that goes private takes its published results with it: making it public again does not republish them.
  if (before === 'public' && suite.visibility === 'private') await clearPublications({ 'suite.id': suite._id.toString() }, 'suite made private');
  invalidatePublic();

  if (before !== suite.visibility) {
    const project = await Project.findById(suite.projectId).select('owner');
    if (project) {
      recordResourceEvent({
        service: 'vision-service',
        resourceType: 'suite',
        resourceId: suite._id.toString(),
        resourceName: `${suite.slug}@${suite.version}`,
        action: 'visibility',
        actorId: actor,
        owner: project.owner,
        visibility: suite.visibility
      });
    }
  }
  return toView(suite);
}
