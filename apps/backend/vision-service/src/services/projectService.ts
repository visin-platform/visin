import { getUserGroups } from '../clients/projectGroupsClient';
import { lookupOwnerIdentities, type OwnerIdentity } from '../clients/ownerIdentityClient';
import { QueryFilter } from 'mongoose';
import {
  atLeast,
  BadRequestError,
  canTransfer,
  ConflictError,
  ForbiddenError,
  logger,
  NotFoundError,
  recordResourceEvent,
  UnauthorizedError,
  type Permission,
  type ResourceOwner,
  type Visibility
} from '@visin/backend-core';
import Project, { IProject } from '../models/Project';
import {
  IProjectTaxonomy,
  TASK_TYPE_METRIC_PRESETS,
  TASK_TYPE_OVERALL_PRESETS
} from '../models/taxonomy';
import { IProjectCosting, costOf, resolveCosting } from '../models/costing';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import Evaluation from '../models/Evaluation';
import { readerVisible } from './evaluationScope';
import Benchmark from '../models/Benchmark';
import { restoreRunEvaluations, trashRunEvaluations } from './runEvaluations';
import type { GetProjectsQuery } from '../validation/projectSchemas';
import { requireUserCredential } from '../middleware/projectTokenContext';
import { callerGroups, membershipOf, projectFilter, projectPermission, resolveProject } from './projectAccessService';
import { purgeProject, TRASH_DAYS } from './purgeService';
import { invalidatePublic } from './publicCache';
import { clearPublications } from './publications';

export interface ProjectPermissions {
  read: boolean;
  contribute: boolean;
  manage: boolean;
  own: boolean;
}

const permissionsOf = (permission: Permission): ProjectPermissions => ({
  read: atLeast(permission, 'read'),
  contribute: atLeast(permission, 'contribute'),
  manage: atLeast(permission, 'manage'),
  own: atLeast(permission, 'own')
});

/**
 * A project as the API returns it: its stored fields, less the legacy
 * `ownerId` and `isPublic` a migrated document still carries, plus what the
 * caller may do with it and who owns it: a group the caller is in by its name, a person by the
 * handle, name and avatar they agreed to show (see `OwnerIdentity`).
 */
export type ProjectView = Record<string, unknown> & {
  owner: ResourceOwner & { name?: string; handle?: string; picture?: string };
  permissions: ProjectPermissions;
};

/** `owners` is what `lookupOwnerIdentities` found for a whole list, so a list asks once rather than per row. */
export async function toProjectView(
  project: IProject,
  userId: string | undefined,
  permission?: Permission,
  owners?: Map<string, OwnerIdentity>
): Promise<ProjectView> {
  const held = permission ?? (await projectPermission(project, userId, { trashed: true }));
  const { ownerId: _ownerId, isPublic: _isPublic, __v: _v, ...fields } = project.toObject() as Record<string, unknown>;
  // What the owner agreed to show anyone; a group's members also see its name when it has no public page.
  const { id: _id, ...shown } = (owners ?? (await lookupOwnerIdentities([project.owner]))).get(project.owner.id) ?? { id: '' };
  let identity: Partial<OwnerIdentity> = shown;
  if (project.owner.kind === 'group' && userId) {
    const name = (await callerGroups.getMyGroups(userId)).find(group => group.groupId === project.owner.id)?.name;
    if (name) identity = { ...shown, name };
  }
  return {
    ...fields,
    owner: { kind: project.owner.kind, id: project.owner.id, ...identity },
    permissions: permissionsOf(held)
  };
}

/** The project, when the caller may do at least `min` with it: 404 when it does not exist, 403 otherwise. */
export async function requireProject(identifier: string, userId: string | undefined, min: Permission = 'read'): Promise<IProject> {
  const project = await resolveProject(identifier);
  if (!project || project.trashedAt) throw new NotFoundError('Project not found');
  if (!atLeast(await projectPermission(project, userId), min)) {
    if (!userId && min !== 'read') throw new UnauthorizedError('Authentication required');
    throw new ForbiddenError(min === 'read' ? undefined : `This needs ${min} permission on the project`);
  }
  return project;
}

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
  const projects = await Project.find(query).sort({ [sortBy]: sortOrder });
  const owners = await lookupOwnerIdentities(projects.map(project => project.owner));
  return Promise.all(projects.map(project => toProjectView(project, userId, undefined, owners)));
};

export const getProjectByIdOrSlug = async (identifier: string, userId: string | undefined): Promise<ProjectView> =>
  toProjectView(await requireProject(identifier, userId), userId);

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
    taxonomy: applyTaskTypePresets(data.taxonomy)
  }).save();
  return toProjectView(project, userId);
};

interface UpdateProjectData {
  name?: string;
  description?: string;
  visibility?: Visibility;
  editorGroupIds?: string[];
  slug?: string;
  taxonomy?: IProjectTaxonomy | null;
  costing?: IProjectCosting | null;
  storage?: IProject['storage'];
  stallAfterMinutes?: number;
}

/** Settings need `manage`; who can see it needs `own`. */
export const updateProject = async (id: string, userId: string, data: UpdateProjectData): Promise<ProjectView> => {
  requireUserCredential();
  const project = await requireProject(id, userId, 'manage');

  const { name, description, visibility, slug, taxonomy, costing, editorGroupIds } = data;
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

  await project.save();
  invalidatePublic();
  return toProjectView(project, userId);
};

const recordEvent = (
  project: IProject,
  actorId: string,
  action: 'transfer' | 'visibility' | 'trash' | 'restore' | 'purge',
  { owner = project.owner, ...extra }: { owner?: ResourceOwner; to?: ResourceOwner; visibility?: string } = {}
) =>
  recordResourceEvent({
    service: 'vision-service',
    resourceType: 'project',
    resourceId: project._id.toString(),
    resourceName: project.name,
    action,
    actorId,
    owner,
    ...extra
  });

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

/**
 * Move the project to the trash, with its live trainings, epochs and test
 * results, all stamped with the same time. Restoring it brings back exactly
 * those; a training trashed on its own beforehand stays in the trash.
 */
export const trashProject = async (id: string, userId: string): Promise<void> => {
  requireUserCredential();
  const project = await requireProject(id, userId, 'manage');
  const now = new Date();
  const marked = await Project.updateOne({ _id: project._id, trashedAt: null }, { $set: { trashedAt: now } });
  if (marked.matchedCount === 0) throw new ConflictError('The project is already in the trash');
  const projectId = project._id.toString();
  const trainingIds = (await Training.find({ projectId, deletedAt: null }).select('_id')).map(training => training._id.toString());
  await Training.updateMany({ _id: { $in: trainingIds }, deletedAt: null }, { $set: { deletedAt: now } });
  await Epoch.updateMany({ trainingId: { $in: trainingIds }, deletedAt: null }, { $set: { deletedAt: now } });
  await trashRunEvaluations({ trainingIds }, now);
  await clearPublications({ projectId }, 'project trashed');
  invalidatePublic();
  recordEvent(project, userId, 'trash');
  logger.info('Project moved to the trash', { projectId, trainings: trainingIds.length });
};

/** A trashed project, when the caller may do at least `min` with it. */
const trashedProject = async (id: string, userId: string, min: Permission): Promise<IProject> => {
  const project = /^[0-9a-fA-F]{24}$/.test(id) ? await Project.findOne({ _id: id, trashedAt: { $ne: null } }) : null;
  if (!project) throw new NotFoundError('No such project in the trash');
  if (!atLeast(await projectPermission(project, userId, { trashed: true }), min)) {
    throw new ForbiddenError("Only the project's owner, or the owning group's owner, can do this");
  }
  return project;
};

/** Projects in the trash the caller manages, most recently trashed first. */
export const listTrashedProjects = async (userId: string): Promise<(ProjectView & { purgeAt: Date })[]> => {
  requireUserCredential();
  const projects = await Project.find(await projectFilter(userId, 'manage', { trashed: true })).sort({ trashedAt: -1 });
  return Promise.all(
    projects.map(async project => ({
      ...(await toProjectView(project, userId)),
      purgeAt: new Date(project.trashedAt!.getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000)
    }))
  );
};

export const restoreProject = async (id: string, userId: string): Promise<ProjectView> => {
  requireUserCredential();
  const project = await trashedProject(id, userId, 'own');
  const trashedAt = project.trashedAt!;
  const projectId = project._id.toString();
  const trainingIds = (await Training.find({ projectId, deletedAt: trashedAt }).select('_id')).map(training => training._id.toString());
  await restoreRunEvaluations({ trainingIds }, trashedAt);
  await Epoch.updateMany({ trainingId: { $in: trainingIds }, deletedAt: trashedAt }, { $unset: { deletedAt: 1 } });
  await Training.updateMany({ _id: { $in: trainingIds }, deletedAt: trashedAt }, { $unset: { deletedAt: 1 } });
  project.trashedAt = undefined;
  await project.save();
  invalidatePublic();
  recordEvent(project, userId, 'restore');
  return toProjectView(project, userId);
};

/** Out of the trash for good, now rather than in 30 days. */
export const deleteProjectForever = async (id: string, userId: string): Promise<void> => {
  requireUserCredential();
  const project = await trashedProject(id, userId, 'own');
  await purgeProject(project);
  recordEvent(project, userId, 'purge');
  logger.info('Project deleted for good', { projectId: id });
};

interface ProjectDashboardStats {
  trainingStats: {
    totalTrainings: number;
    totalTime: number;
    totalEpochs: number;
    avgEpochTime: number;
    /** absent when the project has not priced its hardware */
    totalCpuCost?: number;
    totalGpuCost?: number;
    totalCost?: number;
    /** ISO code the amounts above are denominated in */
    currency?: string;
  };
  testResultsCount: number;
  visualizationsCount: number;
  benchmarksCount: number;
}

export const getProjectDashboardStats = async (
  identifier: string,
  userId: string | undefined
): Promise<ProjectDashboardStats> => {
  const project = await requireProject(identifier, userId);

  const projectId = project._id.toString();
  const NOT_DELETED = [{ deletedAt: null }, { deletedAt: { $exists: false } }];

  // The project's trainings, once. Everything below is scoped by these, and
  // reading them here means the counts join against 118 ids rather than
  // re-deriving the set inside three separate pipelines.
  const trainings = await Training.find({ projectId, deletedAt: null }).select('_id');
  const trainingObjectIds = trainings.map(t => t._id);
  const trainingIds = trainingObjectIds.map(id => id.toString());

  // Sum and count inside the join, so an epoch never leaves the database.
  // The previous form `$lookup`-ed every epoch document into an array and then
  // measured the array: 22,526 documents materialised to produce two numbers.
  const trainingAggregationPipeline = [
    { $match: { projectId, deletedAt: null } },
    {
      $lookup: {
        from: 'training_epoches',
        let: { trainingId: { $toString: '$_id' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$trainingId', '$$trainingId'] }, $or: NOT_DELETED } },
          { $group: { _id: null, time: { $sum: '$epoch_time' }, count: { $sum: 1 } } }
        ],
        as: 'epochStats'
      }
    },
    {
      $addFields: {
        trainingTime: { $ifNull: [{ $arrayElemAt: ['$epochStats.time', 0] }, 0] },
        epochCount: { $ifNull: [{ $arrayElemAt: ['$epochStats.count', 0] }, 0] }
      }
    },
    {
      $group: {
        _id: null,
        totalTrainings: { $sum: 1 },
        totalTime: { $sum: '$trainingTime' },
        totalEpochs: { $sum: '$epochCount' }
      }
    },
    {
      // Costs are applied in JS below, at this project's own rates.
      $addFields: {
        totalHours: { $divide: ['$totalTime', 3600] },
        avgEpochTime: { $cond: { if: { $gt: ['$totalEpochs', 0] }, then: { $divide: ['$totalTime', '$totalEpochs'] }, else: 0 } }
      }
    }
  ];

  // Visualizations still belong to epochs; evaluations carry their project and run directly.
  const countByEpoch = (collection: string) =>
    Epoch.aggregate([
      { $match: { trainingId: { $in: trainingIds }, $or: NOT_DELETED } },
      // Keep the join limited to live records.
      {
        $lookup: {
          from: collection,
          localField: 'epoch_uuid',
          foreignField: 'epoch_uuid',
          pipeline: [{ $match: { $or: NOT_DELETED } }],
          as: 'joined'
        }
      },
      { $group: { _id: null, count: { $sum: { $size: '$joined' } } } }
    ]);

  const fullResults = atLeast(await projectPermission(project, userId), 'contribute');

  // All four are independent, and they used to be awaited one after another —
  // so the endpoint's latency was their sum. It answers with about 300 bytes
  // and was measured at 3.9s against production.
  const [trainingResult, testResultsCount, visualizationsResult, benchmarksCount] = await Promise.all([
    Training.aggregate(trainingAggregationPipeline),
    Evaluation.countDocuments({
      projectId,
      'source.trainingId': { $in: trainingIds },
      deletedAt: null,
      ...(!fullResults ? readerVisible : {})
    }),
    countByEpoch('epoch_visualizations'),
    Benchmark.countDocuments({
      training_id: { $in: trainingObjectIds },
      $or: NOT_DELETED
    })
  ]);

  const trainingStats = trainingResult[0] || {
    totalTrainings: 0,
    totalTime: 0,
    totalEpochs: 0,
    avgEpochTime: 0
  };
  const visualizationsCount = visualizationsResult[0]?.count || 0;

  const costing = resolveCosting(project.costing);
  const cost = costOf(trainingStats.totalTime, costing);

  return {
    trainingStats: {
      totalTrainings: trainingStats.totalTrainings,
      totalTime: trainingStats.totalTime,
      totalEpochs: trainingStats.totalEpochs,
      avgEpochTime: trainingStats.avgEpochTime,
      totalCpuCost: cost.cpuCost,
      totalGpuCost: cost.gpuCost,
      totalCost: cost.totalCost,
      currency: cost.currency
    },
    testResultsCount,
    visualizationsCount,
    benchmarksCount
  };
};
