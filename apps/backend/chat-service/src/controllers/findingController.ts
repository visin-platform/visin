import type { Request, Response } from 'express';
import * as service from '../services/findingService';
import { paramId } from '../utils/request';

export async function saveFinding(req: Request, res: Response): Promise<void> {
  const data = await service.saveFinding(req, paramId(req), req.body);
  res.json({ success: true, data });
}
