import type { Request, Response } from 'express';
import * as service from '../services/membershipService';
import { paramId } from '../utils/request';

export async function updateMembership(req: Request, res: Response): Promise<void> {
  const data = await service.updateMembership(req, paramId(req), req.body?.action);
  res.json({ success: true, data });
}

export async function inviteParticipant(req: Request, res: Response): Promise<void> {
  const data = await service.inviteParticipant(req, paramId(req), req.body?.handle);
  res.json({ success: true, data });
}

export async function removeParticipant(req: Request, res: Response): Promise<void> {
  const data = await service.removeParticipant(req, paramId(req), req.body?.userId);
  res.json({ success: true, data });
}
