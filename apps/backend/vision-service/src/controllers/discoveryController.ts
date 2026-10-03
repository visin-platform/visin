import type { Request, Response } from 'express';
import { describeDeployment } from '../services/discoveryService';

// Where the rest of this deployment is, and what the caller's credential is
export const getDiscovery = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await describeDeployment(req) });
};
