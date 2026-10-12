import { randomUUID } from 'crypto';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import type { Types } from 'mongoose';
import Project from '../models/Project';
import Training from '../models/Training';
import type { ModelLinkInput } from '../validation/artifactSchemas';
import { getUploadSignedUrl } from '../clients/fileServiceClient';
import {
  adoptModelLink,
  modelLinkIdentity,
  modelLinkStored,
  requireModelLinkStorage,
  sameModelLink
} from './sourceRegistry';
import { claimUpload, deleteReservedFile, reserveUpload } from './uploadReservationService';
import { scheduleVerification } from './modelVerificationService';
import { VISIN, type VisinModelLink } from './visinModels';
import type { ModelUploadBody } from '../validation/artifactSchemas';
import { assertResourceWrite } from './writeAccessService';

const MAX_MODELS_PER_RUN = 50;
/** A checkpoint goes up in chunks over whatever link the pipeline has; the URL outlives a slow one. */
const UPLOAD_URL_MINUTES = 240;
/**
 * The most one checkpoint may be: weights of the largest model Visin's pipelines train are about a gigabyte and a
 * half, and a single-file ONNX export cannot pass 2 GiB. Weights with their optimizer state fit with room to spare.
 */
export const MAX_CHECKPOINT_BYTES = 4 * 1024 ** 3;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

async function requireRun(trainingId: string, userId: string | undefined) {
  if (!OBJECT_ID.test(trainingId)) throw new BadRequestError('Invalid training ID format');
  const training = await Training.findOne({ _id: trainingId, deletedAt: null });
  if (!training) throw new NotFoundError('Training not found');
  await assertResourceWrite(training, userId);
  return training;
}

/**
 * Reserve an upload for a model file of this run: where to send the bytes, and the name that claims them. The file is
 * not linked, and not served, until `addModelReference` claims it.
 */
export async function createModelUpload(trainingId: string, userId: string | undefined, body: ModelUploadBody) {
  const training = await requireRun(trainingId, userId);
  const limit = MAX_CHECKPOINT_BYTES;
  if (body.size !== undefined && body.size > limit) {
    throw new BadRequestError(`A checkpoint can be at most ${limit} bytes on this deployment`);
  }
  if ((training.models?.length ?? 0) >= MAX_MODELS_PER_RUN) {
    throw new BadRequestError(`A run can link at most ${MAX_MODELS_PER_RUN} models`);
  }
  const fileId = `models/${training._id}/${randomUUID()}.${body.format}`;
  const mimetype = 'application/octet-stream';
  // The file id is its own allocation, so a claim and a later unlink name the same reservation.
  await reserveUpload(fileId, 'checkpoint', String(training._id), mimetype, userId, fileId, limit);
  const uploadUrl = await getUploadSignedUrl(fileId, mimetype, UPLOAD_URL_MINUTES, limit);
  return { uploadUrl, fileId, maxBytes: limit, expiresInMinutes: UPLOAD_URL_MINUTES };
}

/**
 * Link a model to a run. A pointer to a store (a Hub repo, commit and path) is cheap and idempotent: the same link
 * again changes nothing, which lets a pipeline retry it blindly, even concurrently.
 *
 * A model whose bytes this deployment keeps is the claim of an upload `createModelUpload` reserved: the same file
 * again is the same link, a different file for the same slot is refused, and the file is read in the background
 * (`modelVerificationService`) before it can be served.
 *
 * The project's storage setting is what makes the choice real: a `visin` project
 * (data that must stay on its own servers) refuses a link to anywhere else. What makes two links the same is the
 * provider's own (`modelLinkIdentity`).
 */
export async function addModelReference(trainingId: string, userId: string | undefined, ref: ModelLinkInput) {
  const training = await requireRun(trainingId, userId);
  // A run with no project fails the write check above, so it always has one here.
  const project = await Project.findById(training.projectId);
  requireModelLinkStorage(project, ref);

  const stored = modelLinkStored(ref);
  let link: ModelLinkInput = ref;
  if (stored) {
    const reused = training.models?.find((model) => modelLinkStored(model)?.fileId === stored.fileId);
    if (reused && !sameModelLink(reused, ref)) {
      throw new ConflictError('This uploaded file is already linked at another epoch or format');
    }
    const existing = training.models?.find((model) => sameModelLink(model, ref));
    if (existing) {
      if (modelLinkStored(existing)?.fileId !== stored.fileId) {
        throw new ConflictError(
          'This run already has a model in that format for that epoch; unlink it before replacing it'
        );
      }
      return { created: false, models: training.models ?? [] };
    }
    if (ref.provider === VISIN && !stored.fileId.endsWith(`.${ref.format}`)) {
      throw new BadRequestError('Model format does not match its reserved file');
    }
    const { size } = await claimUpload(stored.fileId, 'checkpoint', String(training._id), 'checkpoint', userId);
    link = adoptModelLink(ref, { size, runName: training.name }) as ModelLinkInput;
  }

  // One conditional update, so two retries cannot both pass a check and both push.
  // `path: null` matches a reference stored without one.
  const updated = await Training.findOneAndUpdate(
    {
      _id: training._id,
      deletedAt: null,
      models: { $not: { $elemMatch: modelLinkIdentity(link) } },
      [`models.${MAX_MODELS_PER_RUN - 1}`]: { $exists: false }
    },
    { $push: { models: { ...link, addedAt: new Date() } } },
    { returnDocument: 'after' }
  );
  if (updated) {
    if (stored) {
      const added = updated.models?.find((model) => modelLinkStored(model)?.fileId === stored.fileId);
      if (added) scheduleVerification(String(training._id), String(added._id));
    }
    return { created: true, models: updated.models ?? [] };
  }

  // Nothing matched: it was already linked (a retry), the run is full, or it was deleted meanwhile.
  const current = await Training.findOne({ _id: training._id, deletedAt: null });
  if (!current) throw new NotFoundError('Training not found');
  const models = current.models ?? [];
  const existing = models.find((model) => sameModelLink(model, link));
  if (!existing) throw new BadRequestError(`A run can link at most ${MAX_MODELS_PER_RUN} models`);
  if (stored && modelLinkStored(existing)?.fileId !== stored.fileId) {
    throw new ConflictError(
      'This run already has a model in that format for that epoch; unlink it before replacing it'
    );
  }
  return { created: false, models };
}

/** Unlink a model. Always allowed, whatever the project's storage is now set to. */
export async function removeModelReference(trainingId: string, userId: string | undefined, modelId: string) {
  const training = await requireRun(trainingId, userId);
  if (!OBJECT_ID.test(modelId)) throw new BadRequestError('Invalid model ID format');
  const model = training.models?.find((candidate) => String(candidate._id) === modelId);
  const updated = await Training.findOneAndUpdate(
    { _id: training._id, 'models._id': modelId },
    { $pull: { models: { _id: modelId } } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new NotFoundError('Model not found on this training');
  // The bytes a link kept go with it; a pointer to a store has none here.
  const stored = model && modelLinkStored(model);
  if (stored) await deleteReservedFile(stored.fileId, 'checkpoint', stored.fileId);
  return updated.models ?? [];
}

/**
 * Record, or clear with `null`, the demo Space of a linked model. Visin does not
 * check that the Space exists or runs this model: it is a link someone with write
 * access chose to show.
 */
export async function setModelDemo(
  trainingId: string,
  userId: string | undefined,
  modelId: string,
  space: string | null
) {
  const training = await requireRun(trainingId, userId);
  if (!OBJECT_ID.test(modelId)) throw new BadRequestError('Invalid model ID format');
  const update = space === null ? { $unset: { 'models.$.space': '' } } : { $set: { 'models.$.space': space } };
  const updated = await Training.findOneAndUpdate({ _id: training._id, 'models._id': modelId }, update, {
    returnDocument: 'after'
  });
  if (!updated) throw new NotFoundError('Model not found on this training');
  return updated.models ?? [];
}

/**
 * The stored model a download may send: one this deployment keeps, whose file has been read and found to be what was
 * declared, and whose licence its publisher stated. Anything else is a conflict that says why, never a half answer.
 */
export function servableModel(
  training: { models?: Array<{ _id: Types.ObjectId; provider: string }> },
  modelId: string
) {
  if (!OBJECT_ID.test(modelId)) throw new BadRequestError('Invalid model ID format');
  const found = training.models?.find((candidate) => String(candidate._id) === modelId);
  if (!found) throw new NotFoundError('Model not found on this training');
  if (found.provider !== VISIN) throw new NotFoundError('This model is not kept on this deployment');
  const model = found as unknown as VisinModelLink & { _id: Types.ObjectId };
  if (model.status === 'failed')
    throw new ConflictError(`This model failed verification: ${model.verifyError ?? 'unknown reason'}`);
  if (model.status !== 'ready' || !model.sha256 || model.size === undefined) {
    throw new ConflictError('This model is still being verified; try again shortly');
  }
  if (!model.license) throw new ConflictError('This model declares no licence; state one before serving it');
  return model;
}
