import type { Request, Response } from 'express';
import * as service from '../services/botPictureService';

export async function uploadBotPicture(req: Request, res: Response): Promise<void> {
  const data = await service.uploadBotPicture(req.user!.id, String(req.params.userId), req.body);
  res.json({ success: true, data });
}
export async function removeBotPicture(req: Request, res: Response): Promise<void> {
  await service.removeBotPicture(req.user!.id, String(req.params.userId));
  res.json({ success: true, data: {} });
}

export async function getBotPicture(req: Request, res: Response): Promise<void> {
  const avatar = await service.getBotPicture(req.user!.id, String(req.params.userId));
  res.set({
    'Content-Type': avatar.contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  res.send(avatar.data);
}
