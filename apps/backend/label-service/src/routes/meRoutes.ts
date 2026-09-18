import { Router, Request, Response } from 'express';
import { asyncHandler, BadRequestError, ForbiddenError } from '@visin/backend-core';
import { isMember, requireUser } from '../services/groupAccessService';
import * as groups from '../clients/groupServiceClient';
import * as datasets from '../clients/datasetServiceClient';
import { MASKS_VARIANT } from '../services/materializationService';

const router = Router();

// The groups I belong to (id, name, my role) — lets the wizard pick a group
// without label-front ever talking to group-service directly.
router.get(
  '/groups',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const myGroups = await groups.getMyGroups(user.id);
    res.json({ success: true, data: myGroups });
  })
);

// Datasets I can build a job on, with their image groups — the wizard's dataset
// picker. Visibility is decided by dataset-service for this user.
router.get(
  '/datasets',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    res.json({ success: true, data: await datasets.listDatasetsFor(user.id) });
  })
);

// Groupable mask fields in one annotation group — what a mask_toggle wizard
// slices on, so one full-corpus dataset can serve many jobs.
router.get(
  '/datasets/:id/mask-fields',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const set = typeof req.query.set === 'string' ? req.query.set : '';
    if (!set) throw new BadRequestError('set is required');
    const dataset = await datasets.getDataset(req.params.id as string);
    const readable =
      dataset.visibility === 'public' || dataset.ownerId === user.id || (dataset.groupId ? await isMember(req, dataset.groupId) : false);
    if (!readable) throw new ForbiddenError('This dataset is shared with a group you are not in');
    res.json({ success: true, data: await datasets.jsonFields(dataset._id, set, MASKS_VARIANT) });
  })
);

export default router;
