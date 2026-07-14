import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import * as apiTokenService from '../services/apiTokenService';

// Every route in apiTokenRoutes.ts is mounted behind `router.use(authMiddleware)`,
// so req.user is always set by the time these handlers run.

export const createToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const token = await apiTokenService.createToken(req.body, userId);

  res.status(201).json({
    success: true,
    data: token
  });
};

export const getTokens = async (req: AuthRequest, res: Response): Promise<void> => {
  const projectId = req.params.projectId as string;
  const tokens = await apiTokenService.getTokens(projectId, req.user!.id);
  res.json({ success: true, data: tokens });
};

export const revokeToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  await apiTokenService.revokeToken(id, req.user!.id);

  res.json({ success: true, message: 'Token revoked' });
};
