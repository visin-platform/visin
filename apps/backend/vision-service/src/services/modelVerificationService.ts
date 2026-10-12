import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { logger, NotFoundError } from '@visin/backend-core';
import Training from '../models/Training';
import { getFileStream } from '../clients/fileServiceClient';
import { deleteReservedFile } from './uploadReservationService';
import { VISIN } from './visinModels';

/**
 * A stored model is `verifying` until its file has been read once: that read records the SHA-256 that names the
 * checkpoint, and checks the digest the uploader declared. It is a read of gigabytes, so it never runs inside a
 * request (a proxy gives a request about a hundred seconds); the claim answers at once and this runs after it.
 *
 * A worker takes a lease on a model before reading, so a second worker (or the sweeper, finding it stuck after a
 * restart) does not read the same file at the same time. A read that fails for a reason that may pass is left for the
 * sweeper; a file that is gone, or a model nobody could read for a day, is failed with the reason.
 */
const LEASE_MS = 30 * 60 * 1000;
const GIVE_UP_MS = 24 * 60 * 60 * 1000;
const PER_SWEEP = 3;

/** Models no worker is reading now: never leased, or a lease that has run out. Evaluated per call, never cached. */
const leaseFree = (now: number) => ({
  $or: [{ verifyingUntil: { $exists: false } }, { verifyingUntil: null }, { verifyingUntil: { $lt: new Date(now) } }]
});

async function digestOf(fileId: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of await getFileStream(fileId)) {
    hash.update(chunk as Buffer);
    size += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), size };
}

async function fail(trainingId: string, modelId: Types.ObjectId, reason: string): Promise<void> {
  await Training.updateOne(
    { _id: trainingId, 'models._id': modelId },
    { $set: { 'models.$.status': 'failed', 'models.$.verifyError': reason }, $unset: { 'models.$.verifyingUntil': '' } }
  );
}

/** Read one stored model and settle it as `ready` or `failed`; does nothing if another worker holds it. */
export async function verifyModel(trainingId: string, modelId: string): Promise<void> {
  const id = new Types.ObjectId(modelId);
  const now = Date.now();
  const training = await Training.findOneAndUpdate(
    {
      _id: trainingId,
      deletedAt: null,
      models: { $elemMatch: { _id: id, provider: VISIN, status: 'verifying', ...leaseFree(now) } }
    },
    { $set: { 'models.$.verifyingUntil': new Date(now + LEASE_MS) } },
    { returnDocument: 'after' }
  );
  const model = training?.models?.find((candidate) => String(candidate._id) === modelId);
  if (!model || model.provider !== VISIN) return;

  try {
    const { sha256, size } = await digestOf(model.fileId);
    if (model.size !== undefined && size !== model.size) {
      await fail(trainingId, id, `The stored file is ${size} bytes, not the ${model.size} that arrived`);
    } else if (model.sha256 && model.sha256 !== sha256) {
      // Whatever the uploader meant to send, this is not it: keep nothing a person might download.
      await deleteReservedFile(model.fileId, 'checkpoint', model.fileId);
      await fail(trainingId, id, 'The file does not match the SHA-256 that was declared');
    } else {
      await Training.updateOne(
        { _id: trainingId, 'models._id': id },
        {
          $set: {
            'models.$.status': 'ready',
            'models.$.sha256': sha256,
            'models.$.size': size,
            'models.$.verifiedAt': new Date()
          },
          $unset: { 'models.$.verifyingUntil': '', 'models.$.verifyError': '' }
        }
      );
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      await fail(trainingId, id, 'The stored file is gone');
    } else if (now - model.addedAt.getTime() > GIVE_UP_MS) {
      await fail(trainingId, id, 'The file could not be read');
    } else {
      // Possibly passing (storage restarting): release the lease so the next sweep tries again.
      await Training.updateOne({ _id: trainingId, 'models._id': id }, { $unset: { 'models.$.verifyingUntil': '' } });
    }
    logger.warn('Could not verify a stored model', { trainingId, modelId, error: (error as Error).message });
  }
}

/** Verify straight after a claim, without holding up its response. */
export function scheduleVerification(trainingId: string, modelId: string): void {
  setImmediate(() => {
    verifyModel(trainingId, modelId).catch((error) =>
      logger.error('Model verification failed unexpectedly', { trainingId, modelId, error: (error as Error).message })
    );
  });
}

/** The sweeper's job: models whose verification never finished (a restart, a worker that died holding a lease). */
export async function verifyPendingModels(): Promise<number> {
  const stuck = await Training.find({
    deletedAt: null,
    models: { $elemMatch: { provider: VISIN, status: 'verifying', ...leaseFree(Date.now()) } }
  })
    .select('models')
    .limit(PER_SWEEP)
    .lean();
  let verified = 0;
  for (const training of stuck) {
    for (const model of training.models ?? []) {
      if (model.provider !== VISIN || model.status !== 'verifying') continue;
      if (model.verifyingUntil && model.verifyingUntil.getTime() > Date.now()) continue;
      await verifyModel(String(training._id), String(model._id));
      if (++verified >= PER_SWEEP) return verified;
    }
  }
  return verified;
}
