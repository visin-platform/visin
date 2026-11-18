import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, logger } from '@visin/backend-core';
import { createHash } from 'crypto';
import { isValidObjectId, mongo } from 'mongoose';
import Training from '../models/Training';
import RunSample from '../models/RunSample';
import RunSampleBatch from '../models/RunSampleBatch';
import Suite from '../models/Suite';
import { checkProjectAccess } from './projectAccessService';
import { assertResourceWrite } from './writeAccessService';
import { canonicalJson } from './suiteProtocol';
import { touchTraining } from './trainingHeartbeatService';
import { sampleProtocolErrors, type ListRunSamplesQuery, type RunSampleInput } from '../validation/runSampleSchemas';

async function parent(id: string, userId?: string) {
  if (!isValidObjectId(id)) throw new NotFoundError('Run not found');
  const training = await Training.findOne({ _id: id, deletedAt: null });
  if (!training || !(await checkProjectAccess(userId, training.projectId))) throw new NotFoundError('Run not found');
  return training;
}

function content(row: RunSampleInput) {
  return { attrs: row.attrs, fields: row.fields, abstained: row.abstained, parseFailed: row.parseFailed, raw: row.raw, latencyMs: row.latencyMs };
}

export async function writeRunSamples(id: string, userId: string | undefined, rows: RunSampleInput[]) {
  const training = await parent(id, userId);
  await assertResourceWrite(training, userId);
  if (training.kind !== 'inference' || !training.suite || !training.projectId) throw new BadRequestError('Run must name a sample suite');
  const suite = await Suite.findOne({ slug: training.suite.slug, version: training.suite.version, digest: training.suite.digest });
  if (!suite?.protocol.samples) throw new BadRequestError('The pinned sample suite is unavailable');
  for (const row of rows) {
    const errors = sampleProtocolErrors(row, suite.protocol);
    if (errors.length) throw new BadRequestError(`Sample ${row.id}: ${errors.join('; ')}`);
  }
  const trainingId = training._id.toString();
  const ordered = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const payload = canonicalJson(ordered);
  // Leave room for BSON overhead and metadata inside MongoDB's 16 MiB document limit.
  if (mongo.BSON.calculateObjectSize({ samples: ordered }) > 15 * 1024 * 1024) throw new BadRequestError('Sample batch is too large');
  const expected = new Map(rows.map(row => [row.id, canonicalJson(content(row))]));
  const existing = await RunSample.find({ trainingId, sampleId: { $in: rows.map(row => row.id) } }).lean();
  for (const row of existing) if (canonicalJson(content({ ...row, id: row.sampleId } as RunSampleInput)) !== expected.get(row.sampleId)) {
    throw new ConflictError(`Sample ${row.sampleId} already has different content`);
  }
  const batchId = createHash('sha256').update(trainingId).update('\0').update(payload).digest('hex');
  // The payload must be durable before the atomic reservation. A retry has the same batch id.
  try {
    await RunSampleBatch.updateOne({ _id: batchId }, { $setOnInsert: { trainingId, projectId: training.projectId, samples: ordered } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const reserved = await Training.updateOne({ _id: training._id, deletedAt: null, status: { $ne: 'completed' } }, { $addToSet: { pendingSampleBatches: batchId } });
  if (!reserved.matchedCount) throw new ConflictError('The inference run is completed');
  const applied = await applySampleBatch(batchId, trainingId, training.projectId, ordered);
  // A run that only sends samples between progress points is still alive; without this the stall sweeper would
  // mark a slow, healthy inference run stalled.
  await touchTraining(trainingId);
  return applied;
}

async function applySampleBatch(batchId: string, trainingId: string, projectId: string, rows: RunSampleInput[]) {
  const expected = new Map(rows.map(row => [row.id, canonicalJson(content(row))]));
  let sealed = false;
  try {
    try {
      await RunSample.bulkWrite(rows.map(row => ({
        updateOne: {
          filter: { trainingId, sampleId: row.id },
          update: { $setOnInsert: { trainingId, projectId, sampleId: row.id, ...content(row) } },
          upsert: true,
          timestamps: false
        }
      })), { ordered: false });
    } catch (error) {
      // Simultaneous first inserts can lose the unique-index race. Other write failures must surface.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    // Concurrent retries can race the preflight. Check the winning content after the upserts.
    const stored = await RunSample.find({ trainingId, sampleId: { $in: rows.map(row => row.id) } }).lean();
    // Once every id exists, even another concurrent recovery of this batch can only perform no-op upserts.
    sealed = stored.length === rows.length;
    for (const row of stored) if (canonicalJson(content({ ...row, id: row.sampleId } as RunSampleInput)) !== expected.get(row.sampleId)) {
      throw new ConflictError(`Sample ${row.sampleId} already has different content`);
    }
    if (stored.length !== rows.length) throw new ConflictError('A concurrent sample batch is still being written; retry');
    return { accepted: stored.length };
  } finally {
    if (sealed) {
      await Training.updateOne({ _id: trainingId }, { $pull: { pendingSampleBatches: batchId } });
      // Every row is stored, so the payload is redundant. Keeping it until the run completes would hold a second
      // copy of every sample for the whole of a run that can last days. A retry re-creates it from its own body.
      await RunSampleBatch.deleteOne({ _id: batchId });
    }
  }
}

/** Replay reserved batches after a service crash. Identical retries are safe across service instances. */
export async function recoverSampleBatches(): Promise<void> {
  const runs = await Training.find({ 'pendingSampleBatches.0': { $exists: true }, deletedAt: null }).select('pendingSampleBatches').limit(100).lean();
  for (const run of runs) for (const id of run.pendingSampleBatches ?? []) {
    const batch = await RunSampleBatch.findById(id).lean();
    if (!batch) {
      // A payload is deleted only after every one of its rows is stored, and a batch id names its content, so a
      // pending id without a payload was sealed by another request (a duplicate that reserved after the seal).
      // Left pending, it would stop the run from ever completing.
      await Training.updateOne({ _id: run._id }, { $pull: { pendingSampleBatches: id } });
      continue;
    }
    if (batch.trainingId !== String(run._id)) {
      logger.error('Reserved sample batch is missing', { trainingId: String(run._id), batchId: id });
      continue;
    }
    try { await applySampleBatch(id, batch.trainingId, batch.projectId, batch.samples); }
    catch (error) { logger.warn('Could not recover sample batch', { trainingId: batch.trainingId, batchId: id, error: (error as Error).message }); }
  }
}

function filterObject(value: string | undefined): Record<string, string | number | boolean> {
  if (!value) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new BadRequestError('Filters must be JSON objects'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestError('Filters must be JSON objects');
  for (const [key, item] of Object.entries(parsed)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key) || !['string', 'number', 'boolean'].includes(typeof item)) throw new BadRequestError('Invalid sample filter');
  }
  return parsed as Record<string, string | number | boolean>;
}

export async function listRunSamples(id: string, userId: string | undefined, query: ListRunSamplesQuery) {
  const training = await parent(id, userId);
  if (!training.projectId) throw new ForbiddenError();
  const filter: Record<string, unknown> = { trainingId: training._id.toString(), projectId: training.projectId };
  for (const [key, value] of Object.entries(filterObject(query.attrs))) filter[`attrs.${key}`] = value;
  for (const [key, value] of Object.entries(filterObject(query.fields))) filter[`fields.${key}`] = value;
  const [total, samples] = await Promise.all([
    RunSample.countDocuments(filter),
    RunSample.find(filter).sort({ sampleId: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean()
  ]);
  return {
    samples: samples.map(row => ({ id: row.sampleId, ...content({ ...row, id: row.sampleId } as RunSampleInput) })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
  };
}
