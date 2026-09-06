import { Response } from 'express';
import { UnauthorizedError } from '@visin/backend-core';
import * as findingService from '../services/findingService';
import { AuthRequest } from '../middleware/authMiddleware';
import type { ExportFindingQuery, ListFindingsQuery } from '../validation/findingSchemas';

/**
 * Who is writing, as the record should name them.
 *
 * `req.apiKey` being set means software is acting — an assistant over MCP or a
 * script — and the label is the credential's own name, so a finding reads
 * "Claude" rather than an opaque id. A request with no key is a person in the
 * app.
 */
const authorOf = (req: AuthRequest): findingService.Author => {
  if (!req.user?.id) throw new UnauthorizedError('Not authenticated');

  return req.apiKey
    ? { kind: 'assistant', label: req.apiKey.label, userId: req.user.id }
    : { kind: 'person', label: req.user.name || req.user.email || 'You', userId: req.user.id };
};

export const getFindings = async (req: AuthRequest, res: Response): Promise<void> => {
  const filters = req.query as unknown as ListFindingsQuery;

  res.json({ success: true, data: await findingService.listFindings(req.user?.id, filters) });
};

export const getFindingById = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  res.json({ success: true, data: await findingService.getFinding(id, req.user?.id) });
};

/**
 * The finding as a `.tex` section.
 *
 * Answers with the source rather than a file download so the same endpoint
 * serves the app's download button and an assistant asking for it over MCP —
 * one of those needs a Blob and the other needs a string.
 */
export const exportFinding = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { selectBy, direction, metrics } = req.query as unknown as ExportFindingQuery;

  const exported = await findingService.exportFindingAsLatex(id, req.user?.id, {
    selectBy,
    direction,
    metrics
  });

  res.json({ success: true, data: exported });
};

export const createFinding = async (req: AuthRequest, res: Response): Promise<void> => {
  const finding = await findingService.createFinding(req.body, authorOf(req));

  res.status(201).json({ success: true, message: 'Finding recorded', data: finding });
};

export const deleteFinding = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  await findingService.deleteFinding(id, req.user?.id);

  res.json({ success: true, message: 'Finding deleted' });
};
