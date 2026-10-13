import { Router, Request, Response } from 'express';
import { asyncHandler } from '@visin/backend-core';
import { requireUser } from '../services/groupAccessService';
import * as groups from '../clients/groupServiceClient';
import * as datasets from '../clients/datasetServiceClient';

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

export default router;
