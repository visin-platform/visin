import type { Request, Response } from 'express';
import * as service from '../services/assistantAdminService';

export async function getSettings(req: Request, res: Response): Promise<void> {
  const data = await service.getSettings();
  res.json({ success: true, data });
}

export async function listModels(req: Request, res: Response): Promise<void> {
  const data = await service.listModels(req.query);
  res.json({ success: true, data });
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const data = await service.updateSettings(req.user!.id, req.body);
  res.json({ success: true, data });
}

export async function getUsage(req: Request, res: Response): Promise<void> {
  const data = await service.getUsage(req.query);
  res.json({ success: true, data });
}

export async function updatePrices(req: Request, res: Response): Promise<void> {
  const data = await service.updatePrices(req.user!.id, req.body);
  res.json({ success: true, data });
}

export async function backfillQuestionPrices(req: Request, res: Response): Promise<void> {
  const data = await service.backfillQuestionPrices(req.user!.id);
  res.json({ success: true, data });
}

export async function refreshModelPrices(req: Request, res: Response): Promise<void> {
  const data = await service.refreshModelPrices(req.user!.id);
  res.json({ success: true, data });
}

export async function saveKey(req: Request, res: Response): Promise<void> {
  const data = await service.saveKey(req.user!.id, req.params, req.body);
  res.json({ success: true, data });
}

export async function deleteKey(req: Request, res: Response): Promise<void> {
  const data = await service.deleteKey(req.user!.id, req.params);
  res.json({ success: true, data });
}
