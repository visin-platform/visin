import type { Request, Response } from 'express';
import * as service from '../services/sharedAssistantService';
import { paramId } from '../utils/request';

export async function getSharedAssistants(req: Request, res: Response): Promise<void> {
  const data = await service.getSharedAssistants(req, paramId(req));
  res.json({ success: true, data });
}

export async function updateSharedAssistants(req: Request, res: Response): Promise<void> {
  const data = await service.updateSharedAssistants(req, paramId(req), req.body);
  res.json({ success: true, data });
}
