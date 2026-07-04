import { Request, Response } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter } from 'mongoose';
import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import Comparison, { IComparison } from '../models/Comparison';
import { checkProjectAccess, getVisibleProjectIds } from '../services/projectAccessService';
import type { GetComparisonsQuery, GetComparisonStatsQuery } from '../validation/comparisonSchemas';

// Get all comparisons
export const getComparisons = async (req: Request, res: Response): Promise<void> => {
  const {
    page = 1,
    limit = 30,
    search,
    type,
    projectId,
    sortBy,
    order
  } = req.query as unknown as GetComparisonsQuery;

  const query: QueryFilter<IComparison> = { deletedAt: null };

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
    if (!(await checkProjectAccess(req.user?.id, projectId as string))) {
      throw new ForbiddenError();
    }
    query.projectId = projectId;
  } else {
    // No filter given: scope to projects the caller can actually see, plus
    // comparisons with no project at all — otherwise this returns every
    // project's comparisons regardless of privacy.
    const visibleProjectIds = await getVisibleProjectIds(req.user?.id);
    query.$or = [
      { projectId: { $in: visibleProjectIds } },
      { projectId: { $exists: false } },
      { projectId: null }
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [comparisons, total] = await Promise.all([
    Comparison.find(query)
      .sort({ [sortBy]: order })
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
};

// Get comparison by ID
export const getComparisonById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const comparison = await Comparison.findOne({ _id: id, deletedAt: null });

  if (!comparison) {
    throw new NotFoundError('Comparison not found');
  }

  if (!(await checkProjectAccess(req.user?.id, comparison.projectId))) {
    throw new ForbiddenError();
  }

  res.json({
    success: true,
    data: comparison
  });
};

// Get comparison by UUID
export const getComparisonByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  const comparison = await Comparison.findOne({ uuid, deletedAt: null });

  if (!comparison) {
    throw new NotFoundError('Comparison not found');
  }

  if (!(await checkProjectAccess(req.user?.id, comparison.projectId))) {
    throw new ForbiddenError();
  }

  res.json({
    success: true,
    data: comparison
  });
};

// Create comparison
export const createComparison = async (req: Request, res: Response): Promise<void> => {
  const {
    name,
    description,
    type,
    itemIds,
    projectId,
    metadata
  } = req.body;

  // Determine effective projectId: API tokens take precedence over the request body
  const effectiveProjectId: string | undefined = req.projectId || projectId || undefined;

  if (effectiveProjectId && !(await checkProjectAccess(req.user?.id, effectiveProjectId))) {
    throw new ForbiddenError('Access denied to project');
  }

  // Generate UUID if not provided
  const uuid = req.body.uuid || uuidv4();

  const comparison = new Comparison({
    uuid,
    name,
    description,
    type,
    itemIds,
    projectId: effectiveProjectId,
    metadata
  });

  const savedComparison = await comparison.save();

  res.status(201).json({
    success: true,
    message: 'Comparison created successfully',
    data: savedComparison
  });
};

// Get comparison statistics
export const getComparisonStats = async (req: Request, res: Response): Promise<void> => {
  const { type, projectId } = req.query as unknown as GetComparisonStatsQuery;

  const query: QueryFilter<IComparison> = { deletedAt: null };

  // Filter by type if provided
  if (type) {
    query.type = type;
  }

  // Filter by project if provided
  if (projectId) {
    if (!(await checkProjectAccess(req.user?.id, projectId as string))) {
      throw new ForbiddenError();
    }
    query.projectId = projectId;
  } else {
    // No filter given: scope to projects the caller can actually see, plus
    // comparisons with no project at all — otherwise these stats are
    // computed across every project's comparisons regardless of privacy.
    const visibleProjectIds = await getVisibleProjectIds(req.user?.id);
    query.$or = [
      { projectId: { $in: visibleProjectIds } },
      { projectId: { $exists: false } },
      { projectId: null }
    ];
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
};

// Update comparison
export const updateComparison = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updateData = req.body;

  const comparison = await Comparison.findOne({ _id: id, deletedAt: null });

  if (!comparison) {
    throw new NotFoundError('Comparison not found');
  }

  if (!(await checkProjectAccess(req.user?.id, comparison.projectId))) {
    throw new ForbiddenError();
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
};

// Delete comparison (soft delete)
export const deleteComparison = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const comparison = await Comparison.findOne({ _id: id, deletedAt: null });

  if (!comparison) {
    throw new NotFoundError('Comparison not found');
  }

  if (!(await checkProjectAccess(req.user?.id, comparison.projectId))) {
    throw new ForbiddenError();
  }

  // Soft delete the comparison
  comparison.deletedAt = new Date();
  await comparison.save();

  res.json({
    success: true,
    message: 'Comparison deleted successfully'
  });
};
