import type { Request, Response } from 'express';
import * as service from '../services/runService';
import { paramId } from '../utils/request';

export async function listRuns(req: Request, res: Response): Promise<void> {
  const data = await service.listRuns(req, paramId(req));
  res.json({ success: true, data });
}

export async function cancelRuns(req: Request, res: Response): Promise<void> {
  await service.cancelRuns(req, paramId(req));
  res.json({ success: true });
}
