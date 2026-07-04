import { QueryFilter } from 'mongoose';
import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Project, { IProject } from '../models/Project';
import Training from '../models/Training';
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

  // Get training stats
  const trainingAggregationPipeline = [
    { $match: { projectId, deletedAt: null } },
    {
      $lookup: {
        from: 'training_epoches',
        let: { trainingId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] }, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } }
        ],
        as: 'epochs'
      }
    },
    {
      $addFields: {
        trainingTime: { $ifNull: [{ $sum: '$epochs.epoch_time' }, 0] },
        epochCount: { $size: '$epochs' }
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

  const trainingResult = await Training.aggregate(trainingAggregationPipeline);
  const trainingStats = trainingResult[0] || {
    totalTrainings: 0,
    totalTime: 0,
    totalEpochs: 0,
    avgEpochTime: 0,
    totalCpuCost: 0,
    totalGpuCost: 0,
    totalCost: 0
  };

  // Get test results count
  const testResultsAggregation = [
    // Match trainings for this project
    { $match: { projectId, deletedAt: null } },
    // Lookup epochs for each training
    {
      $lookup: {
        from: 'training_epoches',
        let: { trainingId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] }, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } }
        ],
        as: 'epochs'
      }
    },
    // Unwind epochs to get one document per epoch
    { $unwind: '$epochs' },
    // Lookup test results for each epoch
    {
      $lookup: {
        from: 'test_results',
        localField: 'epochs.epoch_uuid',
        foreignField: 'epoch_uuid',
        as: 'testResults'
      }
    },
    // Unwind test results
    { $unwind: '$testResults' },
    // Group to count total test results
    {
      $group: {
        _id: null,
        count: { $sum: 1 }
      }
    }
  ];

  const testResultsResult = await Training.aggregate(testResultsAggregation);
  const testResultsCount = testResultsResult[0]?.count || 0;

  // Get visualizations count
  const visualizationsAggregation = [
    // Match trainings for this project
    { $match: { projectId, deletedAt: null } },
    // Lookup epochs for each training
    {
      $lookup: {
        from: 'training_epoches',
        let: { trainingId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] }, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } }
        ],
        as: 'epochs'
      }
    },
    // Unwind epochs to get one document per epoch
    { $unwind: '$epochs' },
    // Lookup visualizations for each epoch
    {
      $lookup: {
        from: 'epoch_visualizations',
        localField: 'epochs.epoch_uuid',
        foreignField: 'epoch_uuid',
        as: 'visualizations'
      }
    },
    // Unwind visualizations
    { $unwind: '$visualizations' },
    // Group to count total visualizations
    {
      $group: {
        _id: null,
        count: { $sum: 1 }
      }
    }
  ];

  const visualizationsResult = await Training.aggregate(visualizationsAggregation);
  const visualizationsCount = visualizationsResult[0]?.count || 0;

  // Get benchmarks count
  const benchmarksCount = await Benchmark.countDocuments({
    training_id: { $in: (await Training.find({ projectId, deletedAt: null })).map(t => t._id) },
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  });

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
