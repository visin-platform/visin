import type { Request, Response } from 'express';
import * as service from '../services/conversationService';
import { paramId } from '../utils/request';

export async function listConversations(req: Request, res: Response): Promise<void> {
  const data = await service.listConversations(req);
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
