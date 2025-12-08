import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import TestResult from '../models/TestResult';
import Project from '../models/Project';
import { AuthRequest } from '../middleware/authMiddleware';

// Helper function to check if user has access to a project
async function checkProjectAccess(userId: string | undefined, projectId: string | undefined): Promise<boolean> {
  if (!projectId) return true; // If no project, allow (maybe public trainings)

  const project = await Project.findById(projectId);
  if (!project) return false;

  // Allow access if project is public
  if (project.isPublic) return true;

  // For private projects, require authentication and ownership
  if (!userId) return false;
  return project.ownerId === userId;
}

// Get all trainings
export const getTrainings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { 
      page = 1, 
      limit = 30, 
      search, 
      status, 
      datasetId,
      projectId,
      tags
    } = req.query;

    let query: any = { deletedAt: null };

    // Search functionality
    if (search) {
      query.$text = { $search: search as string };
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
      query.projectId = projectId;
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
        tagArray = tags as string[];
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

    // Always sort by updatedAt desc

    [trainings, total] = await Promise.all([
      Training.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Training.countDocuments(query)
    ]);      // Get metrics using aggregation for better performance
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

        console.log('metricsAggregation length:', metricsAggregation.length);
        if (metricsAggregation.length > 0) {
          console.log('sample metrics:', metricsAggregation[0]);
        }

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
    res.json({
      success: true,
      data: {
        trainings,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching trainings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch trainings';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trainings',
      error: errorMessage
    });
  }
};

// Get training by ID
export const getTrainingById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      res.status(404).json({
        success: false,
        message: 'Training not found'
      });
      return;
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    res.json({
      success: true,
      data: training
    });
  } catch (error) {
    console.error('Error fetching training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training',
      error: errorMessage
    });
  }
};

// Get training by UUID
export const getTrainingByUuid = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const userId = req.user?.id;

    const training = await Training.findOne({ uuid, deletedAt: null });

    if (!training) {
      res.status(404).json({
        success: false,
        message: 'Training not found'
      });
      return;
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    res.json({
      success: true,
      data: training
    });
  } catch (error) {
    console.error('Error fetching training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training',
      error: errorMessage
    });
  }
};

// Get training with epochs
export const getTrainingWithEpochs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { sortBy = 'epoch', order = 'asc' } = req.query;

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      res.status(404).json({
        success: false,
        message: 'Training not found'
      });
      return;
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy as string;

    const epochs = await Epoch.find({ trainingId: id, deletedAt: null })
      .sort({ [sortField]: sortOrder });

    res.json({
      success: true,
      data: {
        training,
        epochs
      }
    });
  } catch (error) {
    console.error('Error fetching training with epochs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training with epochs';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training with epochs',
      error: errorMessage
    });
  }
};

// Create training
export const createTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

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
    } = req.body;

    if (!name || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Training name is required'
      });
      return;
    }

    // Check project access if projectId is provided
    if (projectId) {
      const hasAccess = await checkProjectAccess(userId, projectId);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          message: 'Access denied to project'
        });
        return;
      }
    }

    // Generate UUID if not provided
    const uuid = req.body.uuid || uuidv4();

    const training = new Training({
      uuid,
      name: name.trim(),
      description: description?.trim(),
      datasetId,
      configId,
      projectId,
      status,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      startTime,
      endTime,
      metadata
    });

    const savedTraining = await training.save();

    res.status(201).json({
      success: true,
      message: 'Training created successfully',
      data: savedTraining
    });
  } catch (error) {
    console.error('Error creating training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create training';
    res.status(500).json({
      success: false,
      message: 'Failed to create training',
      error: errorMessage
    });
  }
};

// Update training
export const updateTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const { id } = req.params;
    const {
      name, 
      description, 
      datasetId,
      configId,
      projectId,
      status,
      tags,
      startTime,
      endTime,
      metadata 
    } = req.body;

    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400).json({
        success: false,
        message: 'Invalid training ID format'
      });
      return;
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      res.status(404).json({
        success: false,
        message: 'Training not found'
      });
      return;
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    // If changing project, check access to new project
    if (projectId && projectId !== training.projectId) {
      const hasNewAccess = await checkProjectAccess(userId, projectId);
      if (!hasNewAccess) {
        res.status(403).json({
          success: false,
          message: 'Access denied to new project'
        });
        return;
      }
    }

    if (name !== undefined) training.name = name.trim();
    if (description !== undefined) training.description = description?.trim();
    if (datasetId !== undefined) training.datasetId = datasetId;
    if (configId !== undefined) training.configId = configId;
    if (projectId !== undefined) training.projectId = projectId;
    if (status !== undefined) training.status = status;
    if (tags !== undefined) training.tags = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
    if (startTime !== undefined) training.startTime = startTime;
    if (endTime !== undefined) training.endTime = endTime;
    if (metadata !== undefined) training.metadata = metadata;

    const updatedTraining = await training.save();

    res.json({
      success: true,
      message: 'Training updated successfully',
      data: updatedTraining
    });
  } catch (error) {
    console.error('Error updating training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update training';
    res.status(500).json({
      success: false,
      message: 'Failed to update training',
      error: errorMessage
    });
  }
};

// Delete training
export const deleteTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const { id } = req.params;

    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400).json({
        success: false,
        message: 'Invalid training ID format'
      });
      return;
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      res.status(404).json({
        success: false,
        message: 'Training not found'
      });
      return;
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
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

    res.json({
      success: true,
      message: 'Training and associated data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete training';
    res.status(500).json({
      success: false,
      message: 'Failed to delete training',
      error: errorMessage
    });
  }
};

// Get training statistics
export const getTrainingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, datasetId, tags, projectId } = req.query;

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
      matchQuery.projectId = projectId;
    }

    // Filter by tags if provided
    if (tags) {
      let tagArray: string[];
      if (Array.isArray(tags)) {
        tagArray = tags as string[];
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
          ]}
        }
      }
    ];

    const result = await Training.aggregate(aggregationPipeline);
    const stats = result[0] || {
      totalTrainings: 0,
      totalTime: 0,
      totalCpuCost: 0,
      totalGpuCost: 0,
      totalCost: 0
    };

    res.json({
      success: true,
      data: {
        totalTrainings: stats.totalTrainings,
        totalTime: stats.totalTime,
        totalCpuCost: stats.totalCpuCost,
        totalGpuCost: stats.totalGpuCost,
        totalCost: stats.totalCost,
        filters: {
          status: status || null,
          datasetId: datasetId || null,
          projectId: projectId || null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching training stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training stats';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training stats',
      error: errorMessage
    });
  }
};

// Compare trainings
export const compareTrainings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { trainingIds } = req.body;

    if (!trainingIds || !Array.isArray(trainingIds) || trainingIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Training IDs array is required'
      });
      return;
    }

    if (trainingIds.length > 30) {
      res.status(400).json({
        success: false,
        message: 'Maximum 30 trainings can be compared at once'
      });
      return;
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

    res.json({
      success: true,
      data: {
        comparison: comparisonData,
        summary: {
          totalTrainings: trainings.length,
          trainingsWithEpochs: comparisonData.filter(c => c.epochs.length > 0).length
        }
      }
    });
  } catch (error) {
    console.error('Error comparing trainings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to compare trainings';
    res.status(500).json({
      success: false,
      message: 'Failed to compare trainings',
      error: errorMessage
    });
  }
};
