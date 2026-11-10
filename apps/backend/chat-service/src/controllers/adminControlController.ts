import type { Request, Response } from 'express';
import * as policies from '../services/adminPolicy';
import * as runs from '../services/adminRunService';
import * as profiles from '../services/assistantProfiles';

export async function getPolicy(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await policies.getPolicy(req.params.id) });
}

export async function savePolicy(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await policies.savePolicy(req.user!.id, req.params.id, req.body) });
}

export async function listRuns(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await runs.runsReport(req.query) });
}

export async function cancelRun(req: Request, res: Response): Promise<void> {
  await runs.cancelRun(req.params.id);
  res.json({ success: true, data: { cancelled: true } });
}

export async function getPlatformProfile(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await profiles.getPlatformProfile() });
}

export async function savePlatformProfile(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await profiles.savePlatformProfile(req.body) });
}
