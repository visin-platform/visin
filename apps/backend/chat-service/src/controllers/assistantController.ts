import { getAssistantProfile, saveAssistantProfile } from '../services/assistantProfiles';
import type { Request, Response } from 'express';
import * as service from '../services/assistantService';
import { paramId } from '../utils/request';

export async function listAssistants(req: Request, res: Response): Promise<void> {
  const data = await service.listAssistants(req.user!.id);
  res.json({ success: true, data });
}

export async function createAssistant(req: Request, res: Response): Promise<void> {
  const data = service.assistantView(await service.createAssistant(req.user!.id, req.body), req.user!.id);
  res.status(201).json({ success: true, data });
}

export async function updateAssistant(req: Request, res: Response): Promise<void> {
  const data = service.assistantView(await service.updateAssistant(req.user!.id, paramId(req), req.body), req.user!.id);
  res.json({ success: true, data });
}

export async function deleteAssistant(req: Request, res: Response): Promise<void> {
  const data = await service.deleteAssistant(req.user!.id, paramId(req));
  res.json({ success: true, data });
}

export async function listPublicAssistants(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await service.listPublicAssistants() });
}

export async function readProfile(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getAssistantProfile(req.user!.id, paramId(req)) });
}
export async function saveProfile(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await saveAssistantProfile(req.user!.id, paramId(req), req.body) });
}

/** Resolve the same effective assistant used by conversation creation, including the platform fallback. */
export async function getDefaultAssistant(req: Request, res: Response): Promise<void> {
  const assistant = await service.defaultAssistantFor(req.user!.id);
  res.json({ success: true, data: assistant ? { _id: assistant.id, name: assistant.name } : null });
}
