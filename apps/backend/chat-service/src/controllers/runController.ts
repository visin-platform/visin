import type { Request, Response } from 'express';
import * as service from '../services/runViews';
import { paramId } from '../utils/request';

export async function listRuns(req: Request, res: Response): Promise<void> {
  const data = await service.listRuns(req, paramId(req));
  res.json({ success: true, data });
}
