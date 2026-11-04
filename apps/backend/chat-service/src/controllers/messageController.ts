import type { Request, Response } from 'express';
import * as service from '../services/messageService';
import { paramId } from '../utils/request';

export async function listMessages(req: Request, res: Response): Promise<void> {
  const data = await service.listMessages(req, paramId(req), req.query.before);
  res.json({ success: true, data });
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const result = await service.sendMessage(req, paramId(req), req.body);
  res.status(result.created ? 201 : 200).json({ success: true, data: result.message });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  await service.markRead(req, paramId(req), req.body?.seq);
  res.json({ success: true });
}
