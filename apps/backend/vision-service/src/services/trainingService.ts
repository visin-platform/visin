import { v4 as uuidv4 } from 'uuid';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import TestResult from '../models/TestResult';
import Project from '../models/Project';

interface PaginationOptions {
  page?: number;
  limit?: number;
}

interface TrainingFilters {
  search?: string;
  status?: string;
  datasetId?: string;
  projectId?: string;
  tags?: string | string[];
}

interface CreateTrainingData {
  name: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  projectId?: string;
  status?: string;
  tags?: string[];
  startTime?: Date;
  endTime?: Date;
  metadata?: any;
  uuid?: string;
}

interface UpdateTrainingData {
  name?: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  status?: string;
  tags?: string[];
  startTime?: Date;
  endTime?: Date;
  metadata?: any;
}

export const trainingService = {
  // Helper function to check if user has access to a project
  async checkProjectAccess(userId: string | undefined, projectId: string | undefined): Promise<boolean> {
    if (!projectId) return true; // If no project, allow (maybe public trainings)

    // Try to find by slug first, then by ID
    let project = await Project.findOne({ slug: projectId });
    if (!project) {
      project = await Project.findById(projectId);
    }
    if (!project) return false;

    // Allow access if project is public
    if (project.isPublic) return true;

    // For private projects, require authentication and ownership
    if (!userId) return false;
    return project.ownerId === userId;
  },

  async getTrainings(userId: string | undefined, filters: TrainingFilters, pagination: PaginationOptions) {
    const { page = 1, limit = 30 } = pagination;
    const { search, status, datasetId, projectId, tags } = filters;

    let query: any = { deletedAt: null };

    // Search functionality
    if (search) {
      query.$text = { $search: search };
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by dataset
    if (datasetId) {
      query.datasetId = datasetId;
    }

    // Filter by project
    if (projectId) {
      // Resolve projectId (could be slug or ID) to actual project
      let project = await Project.findOne({ slug: projectId });
      if (!project) {
        project = await Project.findById(projectId);
      }
      if (!project) {
        throw new Error('Project not found');
      }

      // Check access to the project
      const hasAccess = await this.checkProjectAccess(userId, project._id.toString());
      if (!hasAccess) {
        throw new Error('Access denied to project');
      }

      query.projectId = project._id.toString();
    } else {
      // If no specific project filter, show trainings from accessible projects
      if (userId) {
        // Authenticated user: show trainings from public projects or projects they own, or without project
        const accessibleProjects = await Project.find({
          $or: [
            { isPublic: true },
            { ownerId: userId }
          ]
        }).select('_id');
        const projectIds = accessibleProjects.map(p => p._id.toString());
        query.$or = [
          { projectId: { $in: projectIds } },
          { projectId: { $exists: false } }
        ];
      } else {
        // Unauthenticated user: only show trainings in public projects or without project
        const publicProjects = await Project.find({ isPublic: true }).select('_id');
        const projectIds = publicProjects.map(p => p._id.toString());
        query.$or = [
          { projectId: { $in: projectIds } },
          { projectId: { $exists: false } }
        ];
      }
    }

    // Filter by tags
    if (tags) {
      let tagArray: string[];
      if (Array.isArray(tags)) {
        tagArray = tags;
      } else {
        // Split comma-separated string into array
        tagArray = (tags as string).split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
      if (tagArray.length === 1) {
        query.tags = { $in: tagArray };
      } else {
        query.tags = { $all: tagArray };
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Cost calculation rates
    const CPU_RATE_PER_HOUR = 0.006;
    const GPU_RATE_PER_HOUR = 0.20;

    let trainings: any[] = [];
    let total: number = 0;

    [trainings, total] = await Promise.all([
      Training.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Training.countDocuments(query)
    ]);

    // Get metrics using aggregation for better performance
    if (trainings.length > 0) {
      const trainingIds = trainings.map(t => t._id);
      const metricsAggregation = await Training.aggregate([
        { $match: { _id: { $in: trainingIds } } },
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
            metrics: {
              totalTime: { $ifNull: [{ $sum: '$epochs.epoch_time' }, 0] },
              epochCount: { $size: '$epochs' },
              maxEpoch: { $ifNull: [{ $max: '$epochs.epoch' }, 0] },
              lastEpochTimestamp: { $ifNull: [{ $max: '$epochs.timestamp' }, null] }
            }
          }
        },
        {
          $addFields: {
            'metrics.cpuCost': { $multiply: [{ $divide: [{ $ifNull: ['$metrics.totalTime', 0] }, 3600] }, CPU_RATE_PER_HOUR] },
            'metrics.gpuCost': { $multiply: [{ $divide: [{ $ifNull: ['$metrics.totalTime', 0] }, 3600] }, GPU_RATE_PER_HOUR] },
            'metrics.totalCost': { $add: [{ $ifNull: ['$metrics.cpuCost', 0] }, { $ifNull: ['$metrics.gpuCost', 0] }] }
          }
        },
        {
          $project: {
            _id: 1,
            metrics: 1
          }
        }
      ]);

      // Create a map of metrics by training ID
      const metricsMap = new Map();
      metricsAggregation.forEach(item => {
        metricsMap.set(item._id.toString(), item.metrics);
      });

      // Add metrics to trainings
      trainings = trainings.map(training => ({
        ...training.toObject(),
        metrics: metricsMap.get(training._id.toString()) || { totalTime: 0, epochCount: 0, maxEpoch: 0, lastEpochTimestamp: null, cpuCost: 0, gpuCost: 0, totalCost: 0 }
      }));
    }

    return {
      trainings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    };
  },

  async getTrainingById(id: string, userId: string | undefined) {
    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new Error('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return training;
  },

  async getTrainingByUuid(uuid: string, userId: string | undefined) {
    const training = await Training.findOne({ uuid, deletedAt: null });

    if (!training) {
      throw new Error('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return training;
  },

  async getTrainingWithEpochs(id: string, userId: string | undefined, sortBy: string = 'epoch', order: 'asc' | 'desc' = 'asc') {
    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new Error('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy;

    const epochs = await Epoch.find({ trainingId: id, deletedAt: null })
      .sort({ [sortField]: sortOrder });

    return {
      training,
      epochs
    };
  },

  async createTraining(userId: string, data: CreateTrainingData) {
    const { 
      name, 
      description, 
      datasetId,
      configId,
      projectId,
      status = 'pending',
      tags,
      startTime,
      endTime,
      metadata 
    } = data;

    if (!name || name.trim().length === 0) {
      throw new Error('Training name is required');
    }

    // Check project access if projectId is provided
    let resolvedProjectId: string | undefined;
    if (projectId) {
      const hasAccess = await this.checkProjectAccess(userId, projectId);
      if (!hasAccess) {
        throw new Error('Access denied to project');
      }

      // Resolve to actual project _id for storage
      let project = await Project.findOne({ slug: projectId });
      if (!project) {
        project = await Project.findById(projectId);
      }
      if (project) {
        resolvedProjectId = project._id.toString();
      } else {
        resolvedProjectId = projectId; // Fallback
      }
    }

    // Generate UUID if not provided
    const uuid = data.uuid || uuidv4();

    const training = new Training({
      uuid,
      name: name.trim(),
      description: description?.trim(),
      datasetId,
      configId,
      projectId: resolvedProjectId,
      status,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      startTime,
      endTime,
      metadata
    });

    const savedTraining = await training.save();
    return savedTraining;
  },

  async updateTraining(id: string, userId: string, data: UpdateTrainingData) {
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new Error('Invalid training ID format');
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new Error('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const {
      name, 
      description, 
      datasetId,
      configId,
      status,
      tags,
      startTime,
      endTime,
      metadata 
    } = data;

    if (name !== undefined) training.name = name.trim();
    if (description !== undefined) training.description = description?.trim();
    if (datasetId !== undefined) training.datasetId = datasetId;
    if (configId !== undefined) training.configId = configId;
    if (status !== undefined) training.status = status as any;
    if (tags !== undefined) training.tags = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
    if (startTime !== undefined) training.startTime = startTime;
    if (endTime !== undefined) training.endTime = endTime;
    if (metadata !== undefined) training.metadata = metadata;

    const updatedTraining = await training.save();
    return updatedTraining;
  },

  async deleteTraining(id: string, userId: string) {
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new Error('Invalid training ID format');
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new Error('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const now = new Date();
    
    // Mark training as deleted
    training.deletedAt = now;
    await training.save();

    // Mark all epochs of this training as deleted
    await Epoch.updateMany({ trainingId: id }, { deletedAt: now });

    // Get all epoch UUIDs for this training to mark test results as deleted
    const trainingEpochs = await Epoch.find({ trainingId: id }, 'epoch_uuid');
    const epochUuids = trainingEpochs.map(e => e.epoch_uuid);

    if (epochUuids.length > 0) {
      // Mark all test results for these epochs as deleted
      await TestResult.updateMany({ epoch_uuid: { $in: epochUuids } }, { deletedAt: now });
    }

    return true;
  },

  async getTrainingStats(filters: TrainingFilters) {
    const { status, datasetId, tags, projectId } = filters;

    let matchQuery: any = { deletedAt: null };

    // Filter by status if provided
    if (status) {
      matchQuery.status = status;
    }

    // Filter by dataset if provided
    if (datasetId) {
      matchQuery.datasetId = datasetId;
    }

    // Filter by project if provided
    if (projectId) {
      // Resolve projectId to _id
      let project = await Project.findOne({ slug: projectId });
      if (!project) {
        project = await Project.findById(projectId);
      }
      if (project) {
        matchQuery.projectId = project._id.toString();
      } else {
        matchQuery.projectId = projectId; // Fallback
      }
    }

    // Filter by tags if provided
    if (tags) {
      let tagArray: string[];
      if (Array.isArray(tags)) {
        tagArray = tags;
      } else {
        // Split comma-separated string into array
        tagArray = (tags as string).split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
      if (tagArray.length === 1) {
        matchQuery.tags = { $in: tagArray };
      } else {
        matchQuery.tags = { $all: tagArray };
      }
    }

    const CPU_RATE_PER_HOUR = 0.006;
    const GPU_RATE_PER_HOUR = 0.20;

    // Use aggregation pipeline for better performance
    const aggregationPipeline = [
      // Match trainings based on filters
      { $match: matchQuery },
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
      // Add computed fields
      {
        $addFields: {
          trainingTime: { $ifNull: [{ $sum: '$epochs.epoch_time' }, 0] },
          epochCount: { $size: '$epochs' }
        }
      },
      // Group to calculate totals
      {
        $group: {
          _id: null,
          totalTrainings: { $sum: 1 },
          totalTime: { $sum: '$trainingTime' },
          totalEpochs: { $sum: '$epochCount' }
        }
      },
      // Calculate costs
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

    const result = await Training.aggregate(aggregationPipeline);
    const stats = result[0] || {
      totalTrainings: 0,
      totalTime: 0,
      totalEpochs: 0,
      totalCpuCost: 0,
      totalGpuCost: 0,
      totalCost: 0,
      avgEpochTime: 0
    };

    return {
      ...stats,
      filters: {
        status: status || null,
        datasetId: datasetId || null,
        projectId: projectId || null
      }
    };
  },

  async compareTrainings(trainingIds: string[]) {
    if (trainingIds.length > 30) {
      throw new Error('Maximum 30 trainings can be compared at once');
    }

    // Fetch trainings and their epochs
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });
    const epochs = await Epoch.find({ trainingId: { $in: trainingIds }, deletedAt: null })
      .sort({ trainingId: 1, epoch: 1 });

    // Group epochs by training ID
    const epochsByTraining: Record<string, any[]> = epochs.reduce((acc, epoch) => {
      const trainingId = epoch.trainingId.toString();
      if (!acc[trainingId]) {
        acc[trainingId] = [];
      }
      acc[trainingId].push(epoch);
      return acc;
    }, {} as Record<string, any[]>);

    // Calculate comparison data for each training
    const comparisonData = trainings.map(training => {
      const trainingId = (training._id as any).toString();
      const trainingEpochs = epochsByTraining[trainingId] || [];
      const lastEpoch = trainingEpochs.length > 0 ? trainingEpochs[trainingEpochs.length - 1] : null;

      // Calculate training metrics
      const totalTime = trainingEpochs.reduce((sum: number, epoch: any) => sum + (epoch.epoch_time || 0), 0);
      const avgEpochTime = trainingEpochs.length > 0 ? totalTime / trainingEpochs.length : 0;

      // Calculate costs (using the same rates as frontend)
      const CPU_RATE_PER_HOUR = 0.006;
      const GPU_RATE_PER_HOUR = 0.20;
      const totalHours = totalTime / 3600;
      const cpuCost = totalHours * CPU_RATE_PER_HOUR;
      const gpuCost = totalHours * GPU_RATE_PER_HOUR;
      const totalCost = cpuCost + gpuCost;

      return {
        training: {
          _id: training._id,
          name: training.name,
          description: training.description,
          status: training.status,
          createdAt: training.createdAt,
          updatedAt: training.updatedAt
        },
        metrics: {
          totalEpochs: trainingEpochs.length,
          totalTime,
          avgEpochTime,
          maxEpochTime: trainingEpochs.length > 0 ? Math.max(...trainingEpochs.map((e: any) => e.epoch_time || 0)) : 0,
          cost: {
            totalHours,
            cpuCost,
            gpuCost,
            totalCost
          }
        },
        lastEpoch: lastEpoch ? {
          epoch: lastEpoch.epoch,
          results: lastEpoch.results,
          timestamp: lastEpoch.timestamp
        } : null,
        epochs: trainingEpochs.map((epoch: any) => ({
          epoch: epoch.epoch,
          results: epoch.results,
          epoch_time: epoch.epoch_time,
          timestamp: epoch.timestamp
        }))
      };
    });

    return {
      comparison: comparisonData,
      summary: {
        totalTrainings: trainings.length,
        trainingsWithEpochs: comparisonData.filter(c => c.epochs.length > 0).length
      }
    };
  }
};
