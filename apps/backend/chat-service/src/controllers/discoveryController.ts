import type { Request, Response } from 'express';
import * as service from '../services/discoveryService';

export async function getCapabilities(req: Request, res: Response): Promise<void> {
  const data = await service.getCapabilities(req.user!.id);
  res.json({ success: true, data });
}

export async function listGroups(req: Request, res: Response): Promise<void> {
  const data = await service.listGroups(req.user!.id);
  res.json({ success: true, data });
}

export async function listProjects(req: Request, res: Response): Promise<void> {
  const data = await service.listProjects(req);
  res.json({ success: true, data });
}

export async function listContacts(req: Request, res: Response): Promise<void> {
  const data = await service.listContacts(req);
  res.json({ success: true, data });
}

export async function getPerson(req: Request, res: Response): Promise<void> {
  const data = await service.getPerson(req.params.handle);
  res.json({ success: true, data });
}
