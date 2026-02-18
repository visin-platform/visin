import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Comparison from '../models/Comparison';

// Get all comparisons
export const getComparisons = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 30,
      search,
      type,
      projectId,
      sortBy = 'updatedAt',
      order = 'desc'
    } = req.query;

    let query: any = { deletedAt: null };

    // Search functionality
    if (search) {
      query.$text = { $search: search as string };
    }

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by project
    if (projectId) {
      query.projectId = projectId;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy as string;

    const [comparisons, total] = await Promise.all([
      Comparison.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(Number(limit)),
      Comparison.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        comparisons,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching comparisons:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch comparisons';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comparisons',
      error: errorMessage
    });
  }
};

// Get comparison by ID
export const getComparisonById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const comparison = await Comparison.findOne({ _id: id, deletedAt: null });

    if (!comparison) {
      res.status(404).json({
        success: false,
        message: 'Comparison not found'
      });
      return;
    }

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error fetching comparison:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch comparison';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comparison',
      error: errorMessage
    });
  }
};

// Get comparison by UUID
export const getComparisonByUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;

    const comparison = await Comparison.findOne({ uuid, deletedAt: null });

    if (!comparison) {
      res.status(404).json({
        success: false,
        message: 'Comparison not found'
      });
      return;
    }

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error fetching comparison:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch comparison';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comparison',
      error: errorMessage
    });
  }
};

// Create comparison
export const createComparison = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      description,
      type,
      itemIds,
      projectId,
      metadata
    } = req.body;

    if (!name || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Comparison name is required'
      });
      return;
    }

    if (!type || !['trainings', 'tests', 'benchmarks', 'epochs'].includes(type)) {
      res.status(400).json({
        success: false,
        message: 'Valid comparison type is required (trainings, tests, benchmarks, epochs)'
      });
      return;
    }

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Item IDs array is required and must not be empty'
      });
      return;
    }

    if (!projectId || projectId.trim().length === 0) {
      // projectId is optional for global comparisons
    }

    if (itemIds.length > 50) {
      res.status(400).json({
        success: false,
        message: 'Maximum 50 items can be compared at once'
      });
      return;
    }

    // Generate UUID if not provided
    const uuid = req.body.uuid || uuidv4();

    const comparison = new Comparison({
      uuid,
      name: name.trim(),
      description: description?.trim(),
      type,
      itemIds,
      projectId: projectId?.trim(),
      metadata
    });

    const savedComparison = await comparison.save();

    res.status(201).json({
      success: true,
      message: 'Comparison created successfully',
      data: savedComparison
    });
  } catch (error) {
    console.error('Error creating comparison:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create comparison';
    res.status(500).json({
      success: false,
      message: 'Failed to create comparison',
      error: errorMessage
    });
  }
};

// Get comparison statistics
export const getComparisonStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, projectId } = req.query;

    let query: any = { deletedAt: null };

    // Filter by type if provided
    if (type) {
      query.type = type;
    }

    // Filter by project if provided
    if (projectId) {
      query.projectId = projectId;
    }

    const stats = await Comparison.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgItemCount: { $avg: { $size: '$itemIds' } },
          maxItemCount: { $max: { $size: '$itemIds' } },
          minItemCount: { $min: { $size: '$itemIds' } }
        }
      }
    ]);

    const totalComparisons = await Comparison.countDocuments(query);

    res.json({
      success: true,
      data: {
        totalComparisons,
        byType: stats,
        filters: {
          type: type || null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching comparison stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch comparison stats';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comparison stats',
      error: errorMessage
    });
  }
};

// Update comparison
export const updateComparison = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const comparison = await Comparison.findOne({ _id: id, deletedAt: null });

    if (!comparison) {
      res.status(404).json({
        success: false,
        message: 'Comparison not found'
      });
      return;
    }

    // Update allowed fields
    if (updateData.name !== undefined) {
      comparison.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      comparison.description = updateData.description?.trim();
    }
    if (updateData.itemIds !== undefined) {
      comparison.itemIds = updateData.itemIds;
    }
    if (updateData.metadata !== undefined) {
      comparison.metadata = updateData.metadata;
    }

    const updatedComparison = await comparison.save();

    res.json({
      success: true,
      message: 'Comparison updated successfully',
      data: updatedComparison
    });
  } catch (error) {
    console.error('Error updating comparison:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update comparison'
    });
  }
};

// Delete comparison (soft delete)
export const deleteComparison = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const comparison = await Comparison.findOne({ _id: id, deletedAt: null });

    if (!comparison) {
      res.status(404).json({
        success: false,
        message: 'Comparison not found'
      });
      return;
    }

    // Soft delete the comparison
    comparison.deletedAt = new Date();
    await comparison.save();

    res.json({
      success: true,
      message: 'Comparison deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting comparison:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete comparison'
    });
  }
};