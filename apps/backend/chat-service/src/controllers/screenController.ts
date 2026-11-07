import type { Request, Response } from 'express';
import { answerScreen, screenCallsFor } from '../services/screen';
import { paramId } from '../utils/request';

export async function answerScreenCall(req: Request, res: Response): Promise<void> {
  await answerScreen(req.user!.id, paramId(req), req.body);
  res.json({ success: true });
}

export async function listScreenCalls(req: Request, res: Response): Promise<void> {
  const data = await screenCallsFor(req, paramId(req), req.query.tab);
  res.json({ success: true, data });
}
