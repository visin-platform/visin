import type { Request, Response } from 'express';
import { getUserGroups } from '../clients/projectGroupsClient';
import { getWriteCapabilities, type WritableKind } from '../services/writeCapabilitiesService';
import { tokenProjectId } from '../middleware/projectTokenContext';

export async function getCapabilities(req: Request, res: Response): Promise<void> {
  const { kind, ids } = req.query as unknown as { kind: WritableKind; ids: string[] };
  const data = await getWriteCapabilities(kind, ids, tokenProjectId() ? undefined : req.user?.id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
}

export async function getGroups(req: Request, res: Response): Promise<void> {
  const data = tokenProjectId() ? [] : await getUserGroups(req.user?.id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
}
