import { BadRequestError, NotFoundError } from '@visin/backend-core';
import Project from '../models/Project';
import Training from '../models/Training';
import type { ArtifactRefInput } from '../validation/artifactSchemas';
import { requireHubStorage } from './projectStorage';
import { assertResourceWrite } from './writeAccessService';

const MAX_MODELS_PER_RUN = 50;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

async function requireRun(trainingId: string, userId: string | undefined) {
  if (!OBJECT_ID.test(trainingId)) throw new BadRequestError('Invalid training ID format');
  const training = await Training.findOne({ _id: trainingId, deletedAt: null });
  if (!training) throw new NotFoundError('Training not found');
  await assertResourceWrite(training, userId);
  return training;
}

/**
 * Link a model on the Hub to a run. Visin keeps the pointer, never the bytes, so
 * this is cheap and idempotent: the same repo, commit and path again changes
 * nothing, which lets a pipeline retry it blindly, even concurrently.
 *
 * The project's storage setting is what makes the choice real: a `visin` project
 * (data that must stay on its own servers) refuses a link to anywhere else.
 */
export async function addModelReference(trainingId: string, userId: string | undefined, ref: ArtifactRefInput) {
  const training = await requireRun(trainingId, userId);
  // A run with no project fails the write check above, so it always has one here.
  const project = await Project.findById(training.projectId);
  requireHubStorage(project, 'link Hub models');

  // One conditional update, so two retries cannot both pass a check and both push.
  // `path: null` matches a reference stored without one.
  const updated = await Training.findOneAndUpdate(
    {
      _id: training._id,
      deletedAt: null,
      models: { $not: { $elemMatch: { provider: ref.provider, repo: ref.repo, revision: ref.revision, path: ref.path ?? null } } },
      [`models.${MAX_MODELS_PER_RUN - 1}`]: { $exists: false }
    },
    { $push: { models: { ...ref, addedAt: new Date() } } },
    { returnDocument: 'after' }
  );
  if (updated) return { created: true, models: updated.models ?? [] };

  // Nothing matched: it was already linked (a retry), the run is full, or it was deleted meanwhile.
  const current = await Training.findOne({ _id: training._id, deletedAt: null });
  if (!current) throw new NotFoundError('Training not found');
  const models = current.models ?? [];
  const linked = models.some(model => model.provider === ref.provider && model.repo === ref.repo && model.revision === ref.revision && (model.path ?? null) === (ref.path ?? null));
  if (!linked) throw new BadRequestError(`A run can link at most ${MAX_MODELS_PER_RUN} models`);
  return { created: false, models };
}

/** Unlink a model. Always allowed, whatever the project's storage is now set to. */
export async function removeModelReference(trainingId: string, userId: string | undefined, modelId: string) {
  const training = await requireRun(trainingId, userId);
  if (!OBJECT_ID.test(modelId)) throw new BadRequestError('Invalid model ID format');
  const updated = await Training.findOneAndUpdate({ _id: training._id, 'models._id': modelId }, { $pull: { models: { _id: modelId } } }, { returnDocument: 'after' });
  if (!updated) throw new NotFoundError('Model not found on this training');
  return updated.models ?? [];
}

/**
 * Record, or clear with `null`, the demo Space of a linked model. Visin does not
 * check that the Space exists or runs this model: it is a link someone with write
 * access chose to show.
 */
export async function setModelDemo(trainingId: string, userId: string | undefined, modelId: string, space: string | null) {
  const training = await requireRun(trainingId, userId);
  if (!OBJECT_ID.test(modelId)) throw new BadRequestError('Invalid model ID format');
  const update = space === null ? { $unset: { 'models.$.space': '' } } : { $set: { 'models.$.space': space } };
  const updated = await Training.findOneAndUpdate({ _id: training._id, 'models._id': modelId }, update, { returnDocument: 'after' });
  if (!updated) throw new NotFoundError('Model not found on this training');
  return updated.models ?? [];
}
