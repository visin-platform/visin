import { Response } from 'express';
import Project from '../models/Project';
import Training from '../models/Training';
import TestResult from '../models/TestResult';
import EpochVisualization from '../models/EpochVisualization';
import Benchmark from '../models/Benchmark';
import { AuthRequest } from '../middleware/authMiddleware';

// Get projects (public + private for logged in user)
export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { search } = req.query;

    let query: any = {
      $or: [
        { isPublic: true }
      ]
    };

    // If user is logged in, include their private projects
    if (userId) {
      query.$or.push({ ownerId: userId });
    }

    // Search functionality
    if (search) {
      query.$text = { $search: search as string };
    }

    const projects = await Project.find(query).sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects'
    });
  }
};

// Get project by slug
export const getProjectBySlug = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = req.user?.id;

    const project = await Project.findOne({ slug });

    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found'
      });
      return;
    }

    // Check access
    if (!project.isPublic && project.ownerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project'
    });
  }
};

// Get project by ID
export const getProjectById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const project = await Project.findById(id);

    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found'
      });
      return;
    }

    // Check access
    if (!project.isPublic && project.ownerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project'
    });
  }
};

// Get project by ID or slug
export const getProjectByIdOrSlug = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { identifier } = req.params;
    const userId = req.user?.id;

    let project;

    // Try to find by slug first
    project = await Project.findOne({ slug: identifier });

    // If not found by slug, try by ID
    if (!project) {
      project = await Project.findById(identifier);
    }

    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found'
      });
      return;
    }

    // Check access
    if (!project.isPublic && project.ownerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project'
    });
  }
};

// Create project
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const { name, description, isPublic } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Project name is required'
      });
      return;
    }

    const project = new Project({
      name,
      description,
      isPublic: !!isPublic,
      ownerId: userId
    });

    const savedProject = await project.save();

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: savedProject
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project'
    });
  }
};

// Update project
export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const project = await Project.findById(id);

    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found'
      });
      return;
    }

    if (project.ownerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    const { name, description, isPublic, slug } = req.body;

    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (isPublic !== undefined) project.isPublic = isPublic;
    if (slug !== undefined) {
      if (slug.trim()) {
        // Check if slug is unique
        const existingProject = await Project.findOne({ slug: slug.trim(), _id: { $ne: id } });
        if (existingProject) {
          res.status(400).json({
            success: false,
            message: 'Slug already exists'
          });
          return;
        }
        project.slug = slug.trim();
      } else {
        // Empty slug means remove it
        project.slug = undefined;
      }
    }

    const updatedProject = await project.save();

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: updatedProject
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update project'
    });
  }
};

// Delete project
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const project = await Project.findById(id);

    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found'
      });
      return;
    }

    if (project.ownerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    await project.deleteOne();

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete project'
    });
  }
};

// Get project dashboard stats (aggregated stats for overview)
export const getProjectDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Check if project exists and user has access
    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found'
      });
      return;
    }

    // Check access (public projects or owned by user)
    if (!project.isPublic && project.ownerId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    const CPU_RATE_PER_HOUR = 0.006;
    const GPU_RATE_PER_HOUR = 0.20;

    // Get training stats
    const trainingAggregationPipeline = [
      { $match: { projectId: id, deletedAt: null } },
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
      { $match: { projectId: id, deletedAt: null } },
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
      { $match: { projectId: id, deletedAt: null } },
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
      training_id: { $in: (await Training.find({ projectId: id, deletedAt: null })).map(t => t._id) },
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
    });

    res.json({
      success: true,
      data: {
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
      }
    });
  } catch (error) {
    console.error('Error fetching project dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project dashboard stats'
    });
  }
};
