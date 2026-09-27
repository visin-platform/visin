import { Router, Request, Response } from 'express';
import { asyncHandler, atLeast, BadRequestError, ForbiddenError } from '@visin/backend-core';
import { requireUser } from '../services/groupAccessService';
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

// Datasets I can build a job on (those I manage), with their image groups — the
// wizard's dataset picker. dataset-service decides for this user.
router.get(
  '/datasets',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    res.json({ success: true, data: await datasets.listDatasetsFor(user.id, 'manage') });
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
    if (!atLeast(await datasets.getPermission(dataset._id, user.id), 'read')) {
      throw new ForbiddenError('This dataset is private to its owner');
    }
    res.json({ success: true, data: await datasets.jsonFields(dataset._id, set, MASKS_VARIANT) });
  })
);

export default router;
