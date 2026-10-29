import { resolveDatasetReference } from './datasetReferenceService';
import { requireDatasetStorage } from './sourceRegistry';
import Config from '../models/Config';
import { assertResourceWrite, requireActor } from './writeAccessService';
import { getEditableProjectIds, projectFilter, resolveProject } from './projectAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter } from 'mongoose';
import { tokenProjectId } from '../middleware/projectTokenContext';
import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Training, { ITraining } from '../models/Training';
import Epoch from '../models/Epoch';
import { restoreRunEvaluations, trashRunEvaluations } from './runEvaluations';
import Comparison from '../models/Comparison';
import Project from '../models/Project';
import { checkProjectAccess, getVisibleProjectIds } from './projectAccessService';
import { touchProjectActivity } from './projectActivity';
import type { PaginationOptions } from './trainingTypes';
import { getTrainings } from './trainingList';
import { getTrainingStats } from './trainingStats';
import { compareTrainings } from './trainingCompare';

export type { TrainingWithMetrics } from './trainingList';

interface CreateTrainingData {
  name: string;
  description?: string;
  notes?: string;
  datasetId?: string;
  dataset?: ITraining['dataset'];
  configId?: string;
  projectId?: string;
  provenance?: Record<string, unknown>;
  status?: string;
  tags?: string | string[];
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
  uuid?: string;
}

interface UpdateTrainingData {
  name?: string;
  description?: string;
  notes?: string;
  datasetId?: string;
  dataset?: ITraining['dataset'];
  configId?: string;
  provenance?: Record<string, unknown>;
  status?: string;
  tags?: string | string[];
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * About `n` items, evenly spaced, always keeping the first and the last.
 *
 * The ends are kept because they are the two points a question about a curve is
 * usually actually about — where it started and where it got to.
 */
function evenlySpaced<T>(items: T[], n: number): T[] {
  if (items.length <= n || n < 2) return items;

  const step = (items.length - 1) / (n - 1);
  const picked: T[] = [];
  for (let i = 0; i < n; i += 1) picked.push(items[Math.round(i * step)]);
  return picked;
}

/** A config is a child of this project, never a cross-project reference. */
async function requireProjectConfig(configId: string | undefined, projectId: string | undefined): Promise<void> {
  if (!configId) return;
  if (!/^[0-9a-fA-F]{24}$/.test(configId) || !(await Config.exists({ _id: configId, projectId }))) {
    throw new NotFoundError('Config not found in this project');
  }
}

export const trainingService = {
  checkProjectAccess,
  getTrainings,
  getTrainingStats,
  compareTrainings,

  /**
   * Every tag in use on the runs this caller can see, for the tag pickers on
   * the trainings screens.
   *
   * The forms used to build this client-side by listing 1000 trainings and
   * collecting `tags` off the rows — which runs the epoch `$lookup` and the
   * per-project costing pass over all 1000 to produce what is one `distinct`
   * over a small field. The edit dialog awaited that before it would open.
   */
  async getTrainingTags(userId: string | undefined): Promise<string[]> {
    const query: QueryFilter<ITraining> = { deletedAt: null };
    if (tokenProjectId()) query.$and = [{ projectId: { $in: await getVisibleProjectIds(userId) } }];

    // The same visible set getTrainings lists.
    query.projectId = { $in: await getVisibleProjectIds(userId) };

    const tags: unknown[] = await Training.distinct('tags', query);
    return tags
      .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
      .sort((a, b) => a.localeCompare(b));
  },

  async getTrainingById(id: string, userId: string | undefined) {
    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    return training;
  },

  async getTrainingByUuid(uuid: string, userId: string | undefined) {
    const training = await Training.findOne({ uuid, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    return training;
  },

  async getTrainingWithEpochs(id: string, userId: string | undefined, sortBy: string, order: 1 | -1, sample?: number) {
    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    const query = { trainingId: id, deletedAt: null };
    const sort = { [sortBy]: order } as Record<string, 1 | -1>;

    if (sample === undefined) {
      const epochs = await Epoch.find(query).sort(sort);
      return { training, epochs, totalEpochs: epochs.length };
    }

    // Ids first, then only the documents actually wanted. Slicing a full read
    // would save the caller the transfer but not this service the work of
    // loading and serializing every epoch, which is the larger half of it.
    // Keyed on `_id` rather than epoch number so it stays correct whatever the
    // rows are sorted by.
    const ids = await Epoch.find(query).select('_id').sort(sort);
    const picked = evenlySpaced(ids, sample).map((row) => row._id);

    const epochs = await Epoch.find({ ...query, _id: { $in: picked } }).sort(sort);
    return { training, epochs, totalEpochs: ids.length };
  },

  /**
   * Every training has a project: the one a project-limited credential names,
   * or `projectId` (an id or a slug). One the caller cannot see reads as not
   * found, so a private project's name is not confirmed to outsiders.
   */
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
      throw new BadRequestError('Training name is required');
    }

    const ownerId = requireActor(userId);
    if (!projectId) {
      throw new BadRequestError("A training needs a project: pass projectId, the project's id or slug");
    }
    const project = await resolveProject(projectId);
    if (!project || !(await checkProjectAccess(userId, projectId))) {
      throw new NotFoundError(
        `Project "${projectId}" not found. Create it at /projects?new=1 in Visin, or check the name.`
      );
    }
    const resolvedProjectId = project._id.toString();
    await assertResourceWrite({ projectId: resolvedProjectId, ownerId }, userId);

    await requireProjectConfig(configId, resolvedProjectId);

    // Generate UUID if not provided
    const uuid = data.uuid || uuidv4();

    const dataset = await resolveDatasetReference(
      data.dataset,
      datasetId,
      userId,
      tokenProjectId() ? project.owner : undefined
    );
    requireDatasetStorage(project, dataset);

    const training = new Training({
      ownerId,
      uuid,
      name: name.trim(),
      description: description?.trim(),
      notes: data.notes?.trim() || undefined,
      dataset,
      datasetId,
      configId,
      projectId: resolvedProjectId,
      provenance: data.provenance,
      status,
      lastSeenAt: new Date(),
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      startTime,
      endTime,
      metadata
    });

    if (training.dataset?.source === 'visin') training.datasetId = training.dataset.id;
    const savedTraining = await training.save();
    await touchProjectActivity(resolvedProjectId);
    return savedTraining;
  },

  async updateTraining(id: string, userId: string, data: UpdateTrainingData) {
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestError('Invalid training ID format');
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    await assertResourceWrite(training, userId);

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    const { name, description, datasetId, configId, status, tags, startTime, endTime, metadata } = data;

    await requireProjectConfig(configId, training.projectId);

    if (name !== undefined) training.name = name.trim();
    if (description !== undefined) training.description = description?.trim();
    // An emptied note is a removed one.
    if (data.notes !== undefined) training.notes = data.notes.trim() || undefined;
    if (data.dataset !== undefined || datasetId !== undefined) {
      const project = training.projectId ? await resolveProject(training.projectId) : undefined;
      const dataset = await resolveDatasetReference(
        data.dataset,
        datasetId,
        userId,
        tokenProjectId() ? project?.owner : undefined
      );
      requireDatasetStorage(project, dataset);
      training.dataset = dataset;
      training.datasetId = training.dataset?.source === 'visin' ? training.dataset.id : datasetId;
    }
    if (configId !== undefined) training.configId = configId;
    if (data.provenance !== undefined) training.provenance = data.provenance;
    if (status !== undefined) {
      training.status = status as ITraining['status'];
      if (status === 'running') training.lastSeenAt = new Date();
    }
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
      throw new BadRequestError('Invalid training ID format');
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    await assertResourceWrite(training, userId);

    // Check project access
    const hasAccess = await checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    const now = new Date();

    // Mark training as deleted
    training.deletedAt = now;
    await training.save();

    // Only rows still live take this delete's timestamp, so the stamp names
    // exactly what this delete removed — which is what restoreTraining puts back.
    // Anything deleted on its own beforehand keeps its own time and stays deleted.
    await Epoch.updateMany({ trainingId: id, deletedAt: null }, { deletedAt: now });

    // What the run recorded without a suite goes with it.
    await trashRunEvaluations({ trainingIds: [id] }, now);

    // Only edit comparisons this principal can write. Foreign references remain
    // historical references; deleting a training does not grant their ownership.
    const editableProjects = await getEditableProjectIds(userId);
    await Comparison.updateMany(
      {
        itemIds: id,
        $or: [
          { projectId: { $in: editableProjects } },
          ...(!tokenProjectId() ? [{ projectId: null, ownerId: userId }] : [])
        ]
      },
      { $pull: { itemIds: id }, updatedAt: now }
    );

    return true;
  },

  /**
   * Deleted trainings this caller could put back, most recently deleted first.
   *
   * A delete has always been soft — the run, its epochs and its test results stay
   * in the database with a `deletedAt` — but nothing could reach them again, so an
   * accidental delete of a long run was permanent in every way that mattered.
   * Listed by the rule the delete itself follows: the caller's own runs in a
   * project they contribute to, and anyone's in a project they manage. Runs
   * trashed with their project are not here: they come back with it.
   */
  async getDeletedTrainings(userId: string, pagination: PaginationOptions) {
    const { page = 1, limit = 30 } = pagination;

    const [contributed, managed] = await Promise.all([
      getEditableProjectIds(userId),
      Project.find(await projectFilter(userId, 'manage')).select('_id')
    ]);
    const query: QueryFilter<ITraining> = {
      deletedAt: { $ne: null },
      $or: [
        { projectId: { $in: contributed }, ownerId: userId },
        { projectId: { $in: managed.map((project) => project._id.toString()) } }
      ]
    };

    const [trainings, total] = await Promise.all([
      Training.find(query)
        .sort({ deletedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Training.countDocuments(query)
    ]);

    return {
      trainings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  },

  /**
   * Undo `deleteTraining`: the run comes back with the epochs and test results
   * that delete took with it — and only those, matched on its exact timestamp.
   *
   * Comparisons are the one thing not restored. The delete pulled the run out of
   * them without recording which, so it has to be added back by hand.
   */
  async restoreTraining(id: string, userId: string) {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestError('Invalid training ID format');
    }

    const training = await Training.findOne({ _id: id, deletedAt: { $ne: null } });
    if (!training) {
      throw new NotFoundError('Deleted training not found');
    }

    // Judged as if the run were live: the write policy refuses anything deleted,
    // which is right for every other write and exactly wrong for this one.
    await assertResourceWrite({ ownerId: training.ownerId, projectId: training.projectId }, userId);

    const deletedAt = training.deletedAt!;
    training.deletedAt = undefined;
    await training.save();

    await Epoch.updateMany({ trainingId: id, deletedAt }, { $unset: { deletedAt: 1 } });

    await restoreRunEvaluations({ trainingIds: [id] }, deletedAt);

    return training;
  },
};
