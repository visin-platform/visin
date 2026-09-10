import { assertResourceWrite, requireActor } from './writeAccessService';
import { resolveProject } from './projectAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter } from 'mongoose';
import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import Comparison, { IComparison } from '../models/Comparison';
import { checkProjectAccess, getVisibleProjectIds } from './projectAccessService';
import { tokenProjectId } from '../middleware/projectTokenContext';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import TestResult from '../models/TestResult';
import Benchmark from '../models/Benchmark';
import type { GetComparisonsQuery, GetComparisonStatsQuery } from '../validation/comparisonSchemas';

interface CreateComparisonData {
  uuid?: string;
  name: string;
  description?: string;
  type: IComparison['type'];
  itemIds: string[];
  projectId?: string;
  metadata?: Record<string, unknown>;
}

interface UpdateComparisonData {
  name?: string;
  description?: string;
  itemIds?: string[];
  metadata?: Record<string, unknown>;
}

/** References written by a project credential must stay inside that project. */
async function assertTokenItems(type: IComparison['type'], ids: string[], userId: string | undefined) {
  if (!tokenProjectId()) return;
  for (const id of new Set(ids)) {
    let trainingId: string | undefined;
    if (type === 'trainings') trainingId = id;
    else if (type === 'benchmarks') {
      const benchmark = await Benchmark.findOne({ _id: id, deletedAt: null });
      trainingId = benchmark?.training_id?.toString();
    } else {
      const test = type === 'tests' ? await TestResult.findOne({ _id: id, deletedAt: null }) : undefined;
      if (type === 'tests' && !test) throw new ForbiddenError();
      const epoch = type === 'epochs'
        ? await Epoch.findOne({ _id: id, deletedAt: null })
        : await Epoch.findOne({ epoch_uuid: test!.epoch_uuid, deletedAt: null });
      trainingId = epoch?.trainingId;
    }
    const training = trainingId ? await Training.findOne({ _id: trainingId, deletedAt: null }) : null;
    if (!(await checkProjectAccess(userId, training?.projectId))) throw new ForbiddenError();
  }
}

const buildScopedComparisonQuery = async (
  userId: string | undefined,
  filters: Pick<GetComparisonsQuery, 'search' | 'type' | 'projectId'>
) => {
  const query: QueryFilter<IComparison> = { deletedAt: null };
  if (tokenProjectId()) query.$and = [{ projectId: { $in: await getVisibleProjectIds(userId) } }];

  if (filters.search) {
    query.$text = { $search: filters.search };
  }

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.projectId) {
    if (!(await checkProjectAccess(userId, filters.projectId))) {
      throw new ForbiddenError();
    }
    query.projectId = filters.projectId;
    return query;
  }

  const visibleProjectIds = await getVisibleProjectIds(userId);
  query.$or = [
    { projectId: { $in: visibleProjectIds } },
    { projectId: { $exists: false } },
    { projectId: null }
  ];

  return query;
};

const getAccessibleComparison = async (idQuery: QueryFilter<IComparison>, userId: string | undefined) => {
  const comparison = await Comparison.findOne({ ...idQuery, deletedAt: null });

  if (!comparison) {
    throw new NotFoundError('Comparison not found');
  }

  if (!(await checkProjectAccess(userId, comparison.projectId))) {
    throw new ForbiddenError();
  }

  return comparison;
};

export const getComparisons = async (filters: GetComparisonsQuery, userId: string | undefined) => {
  const {
    page = 1,
    limit = 30,
    sortBy = 'updatedAt',
    order = 'desc'
  } = filters;
  const query = await buildScopedComparisonQuery(userId, filters);
  const numericPage = Number(page);
  const numericLimit = Number(limit);
  const skip = (numericPage - 1) * numericLimit;

  const [comparisons, total] = await Promise.all([
    Comparison.find(query)
      .sort({ [sortBy]: order })
      .skip(skip)
      .limit(numericLimit),
    Comparison.countDocuments(query)
  ]);

  return {
    comparisons,
    pagination: {
      page: numericPage,
      limit: numericLimit,
      total,
      pages: Math.ceil(total / numericLimit)
    }
  };
};

export const getComparisonById = async (id: string, userId: string | undefined) =>
  getAccessibleComparison({ _id: id }, userId);

export const getComparisonByUuid = async (uuid: string, userId: string | undefined) =>
  getAccessibleComparison({ uuid }, userId);

export const createComparison = async (
  data: CreateComparisonData,
  userId: string | undefined,
  tokenProjectId: string | undefined
) => {
  const ownerId = requireActor(userId);
  const reference = tokenProjectId || data.projectId;
  const project = reference ? await resolveProject(reference) : null;
  if (reference && !project) throw new ForbiddenError();
  const effectiveProjectId = project?._id.toString();
  await assertResourceWrite({ ownerId, projectId: effectiveProjectId }, userId);
  await assertTokenItems(data.type, data.itemIds, userId);

  if (effectiveProjectId && !(await checkProjectAccess(userId, effectiveProjectId))) {
    throw new ForbiddenError('Access denied to project');
  }

  const comparison = new Comparison({
    ownerId,
    uuid: data.uuid || uuidv4(),
    name: data.name,
    description: data.description,
    type: data.type,
    itemIds: data.itemIds,
    projectId: effectiveProjectId,
    metadata: data.metadata
  });

  return comparison.save();
};

export const getComparisonStats = async (filters: GetComparisonStatsQuery, userId: string | undefined) => {
  const query = await buildScopedComparisonQuery(userId, filters);

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

  return {
    totalComparisons,
    byType: stats,
    filters: {
      type: filters.type || null
    }
  };
};

export const updateComparison = async (id: string, updateData: UpdateComparisonData, userId: string | undefined) => {
  const comparison = await getAccessibleComparison({ _id: id }, userId);
  await assertResourceWrite(comparison, userId);
  if (updateData.itemIds !== undefined) await assertTokenItems(comparison.type, updateData.itemIds, userId);

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

  return comparison.save();
};

export const deleteComparison = async (id: string, userId: string | undefined) => {
  const comparison = await getAccessibleComparison({ _id: id }, userId);
  await assertResourceWrite(comparison, userId);
  comparison.deletedAt = new Date();
  await comparison.save();
};
