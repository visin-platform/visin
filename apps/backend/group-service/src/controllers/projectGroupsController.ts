import type { Request, Response } from 'express';
import * as service from '../services/projectGroupsService';
import type { ProjectGroupsAssertion } from '../validation/projectGroupsSchemas';

export async function getProjectGroups(req: Request, res: Response): Promise<void> {
  const data = await service.getProjectGroups(req.body as ProjectGroupsAssertion);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
}
