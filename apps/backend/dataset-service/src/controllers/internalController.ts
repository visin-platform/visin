import { Request, Response } from 'express';
import * as internal from '../services/internalService';
import type { InternalItemsQuery, JsonFieldsQuery } from '../validation/datasetSchemas';

const idOf = (req: Request): string => String(req.params.id);

export const listDatasets = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.query as { userId?: string };
  res.json({ success: true, data: await internal.listReadableFor(userId) });
};

export const getDataset = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await internal.getDatasetSummary(idOf(req)) });
};

export const listItems = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await internal.listItemsAfter(idOf(req), req.query as unknown as InternalItemsQuery) });
};

export const jsonFields = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await internal.jsonFields(idOf(req), req.query as unknown as JsonFieldsQuery) });
};

export const getManifest = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await internal.getManifest(idOf(req)) });
};

export const addHold = async (req: Request, res: Response): Promise<void> => {
  await internal.addHold(idOf(req), String(req.params.service), String(req.params.ref));
  res.status(204).end();
};

export const removeHold = async (req: Request, res: Response): Promise<void> => {
  await internal.removeHold(idOf(req), String(req.params.service), String(req.params.ref));
  res.status(204).end();
};
