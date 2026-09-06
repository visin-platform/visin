import { QueryFilter } from 'mongoose';
import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Project, { IProject } from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import Benchmark from '../models/Benchmark';
import type { GetProjectsQuery } from '../validation/projectSchemas';

const CPU_RATE_PER_HOUR = 0.006;
const GPU_RATE_PER_HOUR = 0.20;

function assertAccess(project: IProject, userId: string | undefined): void {
  if (!project.isPublic && project.ownerId !== userId) {
    throw new ForbiddenError();
  }
}

async function resolveByIdentifier(identifier: string): Promise<IProject | null> {
  return (await Project.findOne({ slug: identifier })) || Project.findById(identifier);
}

export const listProjects = async (userId: string | undefined, filters: GetProjectsQuery): Promise<IProject[]> => {
  const { search, sortBy, sortOrder } = filters;

  // If user is logged in, include their private projects
  const visibilityFilter = userId ? [{ isPublic: true }, { ownerId: userId }] : [{ isPublic: true }];
  const query: QueryFilter<IProject> = { $or: visibilityFilter };

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
  assertAccess(project, userId);
  return project;
};

export const getProjectById = async (id: string, userId: string | undefined): Promise<IProject> => {
  const project = await Project.findById(id);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  assertAccess(project, userId);
  return project;
};

export const getProjectByIdOrSlug = async (identifier: string, userId: string | undefined): Promise<IProject> => {
  const project = await resolveByIdentifier(identifier);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  assertAccess(project, userId);
  return project;
};

interface CreateProjectData {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export const createProject = async (userId: string, data: CreateProjectData): Promise<IProject> => {
  const project = new Project({ ...data, ownerId: userId });
  return project.save();
};

interface UpdateProjectData {
  name?: string;
  description?: string;
  isPublic?: boolean;
  slug?: string;
}

export const updateProject = async (id: string, userId: string, data: UpdateProjectData): Promise<IProject> => {
  const project = await Project.findById(id);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.ownerId !== userId) {
    throw new ForbiddenError();
  }

  const { name, description, isPublic, slug } = data;

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

  return project.save();
};

export const deleteProject = async (id: string, userId: string): Promise<void> => {
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
    totalCpuCost: number;
    totalGpuCost: number;
    totalCost: number;
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
  assertAccess(project, userId);

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
      $addFields: {
        totalHours: { $divide: ['$totalTime', 3600] },
        totalCpuCost: { $multiply: [{ $divide: ['$totalTime', 3600] }, CPU_RATE_PER_HOUR] },
        totalGpuCost: { $multiply: [{ $divide: ['$totalTime', 3600] }, GPU_RATE_PER_HOUR] },
        totalCost: { $add: [
          { $multiply: [{ $divide: ['$totalTime', 3600] }, CPU_RATE_PER_HOUR] },
          { $multiply: [{ $divide: ['$totalTime', 3600] }, GPU_RATE_PER_HOUR] }
        ]},
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
    avgEpochTime: 0,
    totalCpuCost: 0,
    totalGpuCost: 0,
    totalCost: 0
  };
  const testResultsCount = testResultsResult[0]?.count || 0;
  const visualizationsCount = visualizationsResult[0]?.count || 0;

  return {
    trainingStats: {
      totalTrainings: trainingStats.totalTrainings,
      totalTime: trainingStats.totalTime,
      totalEpochs: trainingStats.totalEpochs,
      avgEpochTime: trainingStats.avgEpochTime,
      totalCpuCost: trainingStats.totalCpuCost,
      totalGpuCost: trainingStats.totalGpuCost,
      totalCost: trainingStats.totalCost
    },
    testResultsCount,
    visualizationsCount,
    benchmarksCount
  };
};
