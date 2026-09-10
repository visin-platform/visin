import { getUserGroups } from '../clients/projectGroupsClient';
import { QueryFilter } from 'mongoose';
import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Project, { IProject } from '../models/Project';
import {
  IProjectTaxonomy,
  TASK_TYPE_METRIC_PRESETS,
  TASK_TYPE_OVERALL_PRESETS
} from '../models/taxonomy';
import { IProjectCosting, costOf, resolveCosting } from '../models/costing';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import Benchmark from '../models/Benchmark';
import type { GetProjectsQuery } from '../validation/projectSchemas';
import { requireUserCredential, tokenProjectId } from '../middleware/projectTokenContext';
import { isWithinTokenScope, canEditProject, resolveProject } from './projectAccessService';


async function assertAccess(project: IProject, userId: string | undefined): Promise<void> {
  if (!isWithinTokenScope(undefined, project._id.toString()) || (!project.isPublic && !(await canEditProject(project, userId)))) {
    throw new ForbiddenError();
  }
}

async function resolveByIdentifier(identifier: string): Promise<IProject | null> {
  return resolveProject(identifier);
}

export const listProjects = async (userId: string | undefined, filters: GetProjectsQuery): Promise<IProject[]> => {
  const { search, sortBy, sortOrder } = filters;

  // If user is logged in, include their private projects
  const groups = userId && !tokenProjectId() ? await getUserGroups(userId) : [];
  const visibilityFilter = userId ? [{ isPublic: true }, { ownerId: userId }, ...(groups.length ? [{ editorGroupIds: { $in: groups.map(group => group.id) } }] : [])] : [{ isPublic: true }];
  const query: QueryFilter<IProject> = { $or: visibilityFilter };
  if (tokenProjectId()) query._id = tokenProjectId();

  if (search) {
    query.$text = { $search: search };
  }

  return Project.find(query).sort({ [sortBy]: sortOrder });
};

export const getProjectBySlug = async (slug: string, userId: string | undefined): Promise<IProject> => {
  const project = await Project.findOne({ slug });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  await assertAccess(project, userId);
  return project;
};

export const getProjectById = async (id: string, userId: string | undefined): Promise<IProject> => {
  const project = await Project.findById(id);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  await assertAccess(project, userId);
  return project;
};

export const getProjectByIdOrSlug = async (identifier: string, userId: string | undefined): Promise<IProject> => {
  const project = await resolveByIdentifier(identifier);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  await assertAccess(project, userId);
  return project;
};

interface CreateProjectData {
  name: string;
  description?: string;
  isPublic?: boolean;
  editorGroupIds?: string[];
  taxonomy?: IProjectTaxonomy;
  costing?: IProjectCosting;
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

export const createProject = async (userId: string, data: CreateProjectData): Promise<IProject> => {
  requireUserCredential();
  await assertAssignableGroups(data.editorGroupIds || [], [], userId);
  const project = new Project({
    ...data,
    taxonomy: applyTaskTypePresets(data.taxonomy),
    ownerId: userId
  });
  return project.save();
};

interface UpdateProjectData {
  name?: string;
  description?: string;
  isPublic?: boolean;
  editorGroupIds?: string[];
  slug?: string;
  taxonomy?: IProjectTaxonomy | null;
  costing?: IProjectCosting | null;
}

export const updateProject = async (id: string, userId: string, data: UpdateProjectData): Promise<IProject> => {
  requireUserCredential();
  const project = await Project.findById(id);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.ownerId !== userId) {
    throw new ForbiddenError();
  }

  const { name, description, isPublic, slug, taxonomy, costing, editorGroupIds } = data;
  if (editorGroupIds !== undefined) {
    await assertAssignableGroups(editorGroupIds, project.editorGroupIds || [], userId);
    project.editorGroupIds = [...new Set(editorGroupIds)];
  }

  if (name) project.name = name;
  if (description !== undefined) project.description = description;
  if (isPublic !== undefined) project.isPublic = isPublic;
  if (slug !== undefined) {
    if (slug.trim()) {
      // Check if slug is unique
      const existingProject = await Project.findOne({ slug: slug.trim(), _id: { $ne: id } });
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
  // null clears the rates and returns the project to the platform defaults
  if (costing !== undefined) {
    project.costing = costing === null ? undefined : costing;
  }

  return project.save();
};

export const deleteProject = async (id: string, userId: string): Promise<void> => {
  requireUserCredential();
  const project = await Project.findById(id);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.ownerId !== userId) {
    throw new ForbiddenError();
  }
  await project.deleteOne();
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
  const project = await resolveByIdentifier(identifier);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  await assertAccess(project, userId);

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

  /**
   * Count rows in `collection` that hang off this project's epochs.
   *
   * Test results and visualizations reach a training only through
   * `epoch_uuid`, so the join has to pass through the epochs either way. What
   * changed is the direction and the shape: this starts from the epochs of a
   * known set of trainings and sums the matches, where the previous form
   * `$lookup`-ed every epoch, `$unwind`-ed one document per epoch, joined, and
   * unwound again — a fan-out of tens of thousands of documents to produce a
   * single number.
   *
   * The `$in` is the training ids, not the epoch uuids: both work, and the
   * uuid version measured slightly faster here, but it ships one array element
   * per epoch — 22,526 of them on this project — and that grows without bound.
   */
  const countByEpoch = (collection: string) =>
    Epoch.aggregate([
      { $match: { trainingId: { $in: trainingIds }, $or: NOT_DELETED } },
      { $lookup: { from: collection, localField: 'epoch_uuid', foreignField: 'epoch_uuid', as: 'joined' } },
      { $group: { _id: null, count: { $sum: { $size: '$joined' } } } }
    ]);

  // All four are independent, and they used to be awaited one after another —
  // so the endpoint's latency was their sum. It answers with about 300 bytes
  // and was measured at 3.9s against production.
  const [trainingResult, testResultsResult, visualizationsResult, benchmarksCount] = await Promise.all([
    Training.aggregate(trainingAggregationPipeline),
    countByEpoch('test_results'),
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
  const testResultsCount = testResultsResult[0]?.count || 0;
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
