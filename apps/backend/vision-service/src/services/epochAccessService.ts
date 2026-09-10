import Epoch from '../models/Epoch';
import Training from '../models/Training';
import { checkProjectAccess, isWithinTokenScope } from './projectAccessService';

/** A missing/deleted parent never turns a child into public standalone data. */
export async function checkEpochAccess(epochUuid: string, userId?: string, reqProjectId?: string): Promise<boolean> {
  const epoch = await Epoch.findOne({ epoch_uuid: epochUuid, deletedAt: null });
  if (!epoch) return false;
  const training = await Training.findById(epoch.trainingId);
  if (!training || training.deletedAt) return false;
  return (await checkProjectAccess(userId, training.projectId)) && isWithinTokenScope(reqProjectId, training.projectId);
}
