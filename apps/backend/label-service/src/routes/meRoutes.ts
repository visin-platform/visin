import { Router, Request, Response } from 'express';
import { asyncHandler } from '@visin/backend-core';
import { requireUser } from '../services/groupAccessService';
import * as groups from '../clients/groupServiceClient';

const router = Router();

// The groups I belong to (id, name, my role) — lets the wizard pick a group
// without label-front ever talking to group-service directly.
router.get(
  '/groups',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const myGroups = await groups.getMyGroups(user.email!.toLowerCase());
    res.json({ success: true, data: myGroups });
  })
);

export default router;
