import type { Request, Response } from 'express';
import * as auditService from '../services/auditService';
import type { AuditQuery } from '../validation/adminSchemas';

/** Reached only past `requirePlatformAdmin`, so it answers whether the caller may use Admin at all. */
export const getMe = (req: Request, res: Response): void => {
  res.json({ success: true, data: { id: req.user!.id, role: 'admin' } });
};

export const listAudit = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await auditService.listAudit(req.query as unknown as AuditQuery) });
};
