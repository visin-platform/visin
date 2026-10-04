import mongoose from 'mongoose';
import Evaluation from '../../models/Evaluation';
import { contentHashOf } from '../../services/evaluationContent';
import { exploratoryReport } from '../../services/evaluationEligibility';

/**
 * A test a run reported, as the service stores it: an evaluation with no suite, from an epoch of a run. Tests use this
 * where they once created a test result, so what they check is the real record and not a stand-in for it.
 */
export interface RecordedTest {
  projectId: string;
  trainingId?: string;
  epoch?: number;
  epoch_uuid?: string;
  test_uuid?: string;
  timestamp?: Date;
  test_results?: unknown;
  ownerId?: string;
  deletedAt?: Date;
  _id?: mongoose.Types.ObjectId;
  /** judged on a suite: the stored record of one, without the judging (a test of who may see it needs only the suite) */
  suite?: { id: string; slug: string; version: number; digest: string };
}

const document = (fields: RecordedTest) => {
  const timestamp = fields.timestamp ?? new Date();
  const source = {
    ...(fields.trainingId ? { trainingId: fields.trainingId } : {}),
    ...(fields.epoch_uuid ? { epochUuid: fields.epoch_uuid } : {}),
    ...(fields.epoch !== undefined ? { epoch: fields.epoch } : {})
  };
  const results = fields.test_results ?? {};
  return {
    ...(fields._id ? { _id: fields._id } : {}),
    uuid: fields.test_uuid ?? `test-${new mongoose.Types.ObjectId()}`,
    projectId: fields.projectId,
    ownerId: fields.ownerId ?? 'owner',
    source,
    status: 'completed' as const,
    results,
    executedAt: timestamp,
    receivedAt: timestamp,
    validation: exploratoryReport(),
    contentHash: contentHashOf({ source, status: 'completed', results, executedAt: timestamp }),
    ...(fields.suite ? { suite: fields.suite } : {}),
    ...(fields.deletedAt ? { deletedAt: fields.deletedAt } : {})
  };
};

export const recordTest = (fields: RecordedTest) => Evaluation.create(document(fields));
export const recordTests = (rows: RecordedTest[]) => Evaluation.insertMany(rows.map(document));
