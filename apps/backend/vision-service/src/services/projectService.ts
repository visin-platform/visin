import { getUserGroups } from '../clients/projectGroupsClient';
import { lookupOwnerIdentities } from '../clients/ownerIdentityClient';
import { QueryFilter } from 'mongoose';
import { BadRequestError, canTransfer, ForbiddenError, logger, type ResourceOwner, type Visibility } from '@visin/backend-core';
import Project, { IProject } from '../models/Project';
import { IProjectTaxonomy, TASK_TYPE_METRIC_PRESETS, TASK_TYPE_OVERALL_PRESETS } from '../models/taxonomy';
import { IProjectCosting } from '../models/costing';
import Training from '../models/Training';
import type { GetProjectsQuery } from '../validation/projectSchemas';
import { requireUserCredential } from '../middleware/projectTokenContext';
import { callerGroups, membershipOf, projectFilter, projectPermission } from './projectAccessService';
import { chooseCover } from './projectCoverService';
import { invalidatePublic } from './publicCache';
import { clearPublications } from './publications';
import { ProjectView, toProjectView, withCovers, requireProject, recordEvent } from './projectSupport';

// The service's public surface stays here, whichever file a piece now lives in.
export type { ProjectPermissions, ProjectView } from './projectSupport';
export * from './projectTrash';
export * from './projectDashboard';

/** `owner=me`, `owner=<groupId>` or `user=<userId>`: a list narrowed to one owner. */
const ownerFilter = (userId: string | undefined, owner?: string, user?: string): QueryFilter<IProject> => {
  if (user) return { 'owner.kind': 'user', 'owner.id': user };
  if (!owner) return {};
  if (owner === 'me') return { 'owner.kind': 'user', 'owner.id': userId ?? '' };
  return { 'owner.kind': 'group', 'owner.id': owner };
};

export const listProjects = async (userId: string | undefined, filters: GetProjectsQuery): Promise<ProjectView[]> => {
  const { search, sortBy, sortOrder, access, owner, user } = filters;
  const query: QueryFilter<IProject> = {
    $and: [
      await projectFilter(userId, access === 'contribute' ? 'contribute' : 'read'),
      ownerFilter(userId, owner, user),
      ...(search ? [{ $text: { $search: search } }] : [])
    ]
  };
  // Without readmes: each can be 20,000 characters, and a list shows none of them.
  // `lastActivityAt` is sorted here: a project older than that field reads as its last edit.
  const byActivity = sortBy === 'lastActivityAt';
  const found = await Project.find(query).select('-readme').sort(byActivity ? {} : { [sortBy]: sortOrder });
  const activity = (project: IProject) => (project.lastActivityAt ?? project.updatedAt).getTime();
  const projects = byActivity
    ? [...found].sort((a, b) => (sortOrder === 1 ? activity(a) - activity(b) : activity(b) - activity(a)))
    : found;
  const [owners, counts] = await Promise.all([
    lookupOwnerIdentities(projects.map(project => project.owner)),
    runCounts(projects.map(project => String(project._id)))
  ]);
  const views = await Promise.all(
    projects.map(async project => {
      const view = await toProjectView(project, userId, undefined, owners);
      const counted = counts.get(String(project._id));
      return {
        ...view,
        // What a card says at a glance, so the list need not open every project.
        lastActivityAt: (project.lastActivityAt ?? project.updatedAt).toISOString(),
        runs: counted?.runs ?? 0,
        runningRuns: counted?.running ?? 0,
        ...(counted?.lastRunAt ? { lastRunAt: counted.lastRunAt.toISOString() } : {})
      };
    })
  );
  return withCovers(projects, views, userId);
};

/** Runs per project, how many are running, and when the latest started: one grouped read for a whole list. */
async function runCounts(ids: string[]): Promise<Map<string, { runs: number; running: number; lastRunAt?: Date }>> {
  if (ids.length === 0) return new Map();
  const rows = await Training.aggregate<{ _id: string; runs: number; running: number; lastRunAt?: Date }>([
    { $match: { projectId: { $in: ids }, deletedAt: null } },
    {
      $group: {
        _id: '$projectId',
        runs: { $sum: 1 },
        running: { $sum: { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] } },
        lastRunAt: { $max: '$createdAt' }
      }
    }
  ]);
  return new Map(rows.map(row => [row._id, row]));
}

export const getProjectByIdOrSlug = async (identifier: string, userId: string | undefined): Promise<ProjectView> => {
  const project = await requireProject(identifier, userId);
  const [view] = await withCovers([project], [await toProjectView(project, userId)], userId);
  return view;
};

interface CreateProjectData {
  name: string;
  description?: string;
  visibility?: Visibility;
  /** who it belongs to: the caller (the default), or one of their groups */
  owner?: ResourceOwner;
  editorGroupIds?: string[];
  taxonomy?: IProjectTaxonomy;
  costing?: IProjectCosting;
  storage?: IProject['storage'];
  stallAfterMinutes?: number;
}

/**
 * Fills in the metric definitions implied by a chosen task type. Only ever adds:
 * anything the caller spelled out wins, and a project with no `taskType` is left
 * alone so it relies purely on discovery.
 */
export const applyTaskTypePresets = (taxonomy?: IProjectTaxonomy): IProjectTaxonomy | undefined => {
  if (!taxonomy?.taskType) {
    return taxonomy;
  }
  return {
    ...taxonomy,
    metrics: taxonomy.metrics ?? TASK_TYPE_METRIC_PRESETS[taxonomy.taskType],
    overallMetrics: taxonomy.overallMetrics ?? TASK_TYPE_OVERALL_PRESETS[taxonomy.taskType]
  };
};

async function assertAssignableGroups(next: string[], existing: string[], userId: string) {
  const added = next.filter(id => !existing.includes(id));
  if (!added.length) return;
  const available = new Set((await getUserGroups(userId)).map(group => group.id));
  if (added.some(id => !available.has(id))) throw new ForbiddenError('You can only assign groups you belong to');
}

/**
 * A new project belongs to the caller, or to a group they are in. Making a
 * group's project public takes being that group's owner, as it would after.
 */
export const createProject = async (userId: string, data: CreateProjectData): Promise<ProjectView> => {
  requireUserCredential();
  const owner: ResourceOwner = data.owner ?? { kind: 'user', id: userId };
  if (owner.kind === 'user' && owner.id !== userId) throw new ForbiddenError('A project can belong to you or to one of your groups');
  if (owner.kind === 'group') {
    const { member, role } = await callerGroups.checkMembership(owner.id, userId);
    if (!member) throw new ForbiddenError('You can only create a project in a group you belong to');
    if (data.visibility === 'public' && role !== 'owner') throw new ForbiddenError("Only the group's owner can make its projects public");
  }
  await assertAssignableGroups(data.editorGroupIds || [], [], userId);
  const project = await new Project({
    ...data,
    owner,
    createdBy: userId,
    visibility: data.visibility ?? 'private',
    taxonomy: applyTaskTypePresets(data.taxonomy),
    // Making it is the first thing that happens in it.
    lastActivityAt: new Date()
  }).save();
  return toProjectView(project, userId);
};

interface UpdateProjectData {
  name?: string;
  description?: string;
  readme?: string;
  visibility?: Visibility;
  editorGroupIds?: string[];
  slug?: string;
  taxonomy?: IProjectTaxonomy | null;
  costing?: IProjectCosting | null;
  storage?: IProject['storage'];
  stallAfterMinutes?: number;
  /** a visualization of one of its runs; null clears it */
  cover?: { visualizationUuid: string } | null;
}

/** Settings need `manage`; who can see it needs `own`. */
export const updateProject = async (id: string, userId: string, data: UpdateProjectData): Promise<ProjectView> => {
  requireUserCredential();
  const project = await requireProject(id, userId, 'manage');

  const { name, description, readme, visibility, slug, taxonomy, costing, editorGroupIds } = data;
  if (visibility !== undefined && visibility !== project.visibility) {
    if ((await projectPermission(project, userId)) !== 'own') {
      throw new ForbiddenError('Only the project’s owner can change who can see it');
    }
    project.visibility = visibility;
    recordEvent(project, userId, 'visibility', { visibility });
    // Going private ends every publication of the project's results: public again does not bring them back.
    if (visibility === 'private') await clearPublications({ projectId: project._id.toString() }, 'project made private');
  }
  if (editorGroupIds !== undefined) {
    await assertAssignableGroups(editorGroupIds, project.editorGroupIds || [], userId);
    project.editorGroupIds = [...new Set(editorGroupIds)];
  }

  if (name) project.name = name;
  if (description !== undefined) project.description = description;
  // An empty readme is none: there is nothing to show, and the page then offers to write one.
  if (readme !== undefined) project.readme = readme.trim() ? readme : undefined;
  if (slug !== undefined) {
    if (slug.trim()) {
      // An id-shaped slug is ambiguous with the project that id names, and a
      // lookup that tried slugs first would hand one project's records to another.
      if (/^[0-9a-fA-F]{24}$/.test(slug.trim())) {
        throw new BadRequestError('Slug cannot look like a project id');
      }
      // Check if slug is unique
      const existingProject = await Project.findOne({ slug: slug.trim(), _id: { $ne: project._id } });
      if (existingProject) {
        throw new BadRequestError('Slug already exists');
      }
      project.slug = slug.trim();
    } else {
      // Empty slug means remove it
      project.slug = undefined;
    }
  }
  // null clears the taxonomy and returns the project to pure discovery
  if (taxonomy !== undefined) {
    project.taxonomy = taxonomy === null ? undefined : applyTaskTypePresets(taxonomy);
  }
  // null clears the rates: there are no defaults, so the project reports no cost
  if (data.stallAfterMinutes !== undefined) project.stallAfterMinutes = data.stallAfterMinutes;
  if (costing !== undefined) {
    project.costing = costing === null ? undefined : costing;
  }
  if (data.storage !== undefined) project.storage = data.storage;
  if (data.cover !== undefined) project.cover = await chooseCover(project, data.cover?.visualizationUuid ?? null);

  // Changing a project is something happening in it.
  project.lastActivityAt = new Date();
  await project.save();
  invalidatePublic();
  const [view] = await withCovers([project], [await toProjectView(project, userId)], userId);
  return view;
};

/**
 * Hand the project, with everything in it, to another owner. Who may is
 * backend-core's `canTransfer`: the same rule as for datasets.
 */
export const transferProject = async (id: string, userId: string, to: ResourceOwner): Promise<ProjectView> => {
  requireUserCredential();
  const project = await requireProject(id, userId);
  const check = await canTransfer(project.owner, to, userId, membershipOf);
  if (!check.allowed) throw new ForbiddenError(check.reason);
  const from = project.owner;
  project.owner = to;
  await project.save();
  recordEvent(project, userId, 'transfer', { owner: from, to });
  logger.info('Project transferred', { projectId: id, from, to });
  return toProjectView(project, userId);
};
