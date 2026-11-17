import type { Request, Response } from 'express';
import * as service from '../services/conversationService';
import { paramId } from '../utils/request';

export async function listConversations(req: Request, res: Response): Promise<void> {
  const data = await service.listConversations(req, req.query);
  res.json({ success: true, data });
}

export async function createConversation(req: Request, res: Response): Promise<void> {
  const data = await service.createConversation(req, req.body);
  res.status(201).json({ success: true, data });
}

export async function openGroupChannel(req: Request, res: Response): Promise<void> {
  const data = await service.openGroupChannel(req, req.params.groupId);
  res.json({ success: true, data });
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  const data = await service.getConversation(req, paramId(req));
  res.json({ success: true, data });
}

export async function hideConversation(req: Request, res: Response): Promise<void> {
  await service.hideConversation(req, paramId(req));
  res.json({ success: true });
}

export async function unhideConversation(req: Request, res: Response): Promise<void> {
  await service.unhideConversation(req, paramId(req));
  res.json({ success: true });
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  await service.deleteConversation(req, paramId(req));
  res.json({ success: true });
}

export async function startNewTopic(req: Request, res: Response): Promise<void> {
  const data = await service.startNewTopic(req, paramId(req));
  res.status(201).json({ success: true, data });
}
