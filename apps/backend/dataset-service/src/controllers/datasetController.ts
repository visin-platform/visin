import { Request, Response } from 'express';
import { createDatasetAccess } from '../services/accessService';
import * as groups from '../clients/groupServiceClient';
import * as datasets from '../services/datasetService';
import * as items from '../services/itemService';
import { sendSharePage } from '@visin/backend-core';
import { listDatasetActivity } from '../services/activityService';
import { datasetSharePage, datasetSitemap } from '../services/shareService';
import type {
  ActivityQuery,
  ArchiveUploadBody,
  CreateDatasetBody,
  ListDatasetsQuery,
  ListItemsQuery,
  SetCoverBody,
  StartImportBody,
  TransferDatasetBody,
  UpdateDatasetBody
} from '../validation/datasetSchemas';

// One access checker per request: its group lookups are memoized, and must not
// outlive the request that made them.
const accessFor = (req: Request, res: Response) => createDatasetAccess(req.user?.id, res.locals.pipelineDatasetOwner);
const idOf = (req: Request): string => String(req.params.id);

export const listDatasets = async (req: Request, res: Response): Promise<void> => {
  const data = await datasets.listDatasets(accessFor(req, res), req.query as unknown as ListDatasetsQuery);
  res.json({ success: true, data });
};

/** The page a link to a public dataset unfurls from, which sends people on to the app. */
export const getShare = async (req: Request, res: Response): Promise<void> => {
  sendSharePage(res, await datasetSharePage(idOf(req)));
};

/** What a person or a group has made in public, for a profile; the same for everyone who asks. */
export const getActivity = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listDatasetActivity(req.query as unknown as ActivityQuery) });
};

/** The caller's groups — what a dataset can be shared with. */
export const listMyGroups = async (req: Request, res: Response): Promise<void> => {
  const userId = createDatasetAccess(req.user?.id).requireUser();
  const mine = await groups.getMyGroups(userId);
  res.json({ success: true, data: mine.map((group) => ({ id: group.groupId, name: group.name, role: group.role })) });
};

export const createDataset = async (req: Request, res: Response): Promise<void> => {
  const data = await datasets.createDataset(accessFor(req, res), req.body as CreateDatasetBody);
  res.status(201).json({ success: true, data });
};

export const getDataset = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.getDataset(accessFor(req, res), idOf(req)) });
};

export const updateDataset = async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await datasets.updateDataset(accessFor(req, res), idOf(req), req.body as UpdateDatasetBody)
  });
};

/** Into the trash, where its owner can restore it for 30 days. */
export const trashDataset = async (req: Request, res: Response): Promise<void> => {
  await datasets.trashDataset(accessFor(req, res), idOf(req));
  res.json({ success: true, message: 'Dataset moved to the trash' });
};

export const listTrash = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.listTrash(accessFor(req, res)) });
};

export const restoreDataset = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.restoreDataset(accessFor(req, res), idOf(req)) });
};

export const deletePermanently = async (req: Request, res: Response): Promise<void> => {
  await datasets.deletePermanently(accessFor(req, res), idOf(req));
  res.status(202).json({ success: true, message: 'Dataset deletion queued' });
};

export const transferDataset = async (req: Request, res: Response): Promise<void> => {
  const { owner } = req.body as TransferDatasetBody;
  res.json({ success: true, data: await datasets.transferDataset(accessFor(req, res), idOf(req), owner) });
};

export const removeGroup = async (req: Request, res: Response): Promise<void> => {
  res
    .status(202)
    .json({
      success: true,
      data: await datasets.removeGroup(accessFor(req, res), idOf(req), String(req.params.group))
    });
};

export const resumeImport = async (req: Request, res: Response): Promise<void> => {
  res.status(202).json({ success: true, data: await datasets.resumeImport(accessFor(req, res), idOf(req)) });
};

export const setCover = async (req: Request, res: Response): Promise<void> => {
  const { itemId } = req.body as SetCoverBody;
  res.json({ success: true, data: await datasets.setCover(accessFor(req, res), idOf(req), itemId) });
};

export const createArchiveUpload = async (req: Request, res: Response): Promise<void> => {
  res
    .status(201)
    .json({
      success: true,
      data: await datasets.createArchiveUpload(accessFor(req, res), idOf(req), req.body as ArchiveUploadBody)
    });
};

export const completeArchiveUpload = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.completeArchiveUpload(accessFor(req, res), idOf(req)) });
};

export const discardArchiveUpload = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.discardArchiveUpload(accessFor(req, res), idOf(req)) });
};

export const rescanArchive = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.rescanArchive(accessFor(req, res), idOf(req)) });
};

export const hubInfo = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.getHubInfo(accessFor(req, res), idOf(req)) });
};

export const downloadArchive = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.getArchiveDownload(accessFor(req, res), idOf(req)) });
};

export const startImport = async (req: Request, res: Response): Promise<void> => {
  res
    .status(202)
    .json({
      success: true,
      data: await datasets.startImport(accessFor(req, res), idOf(req), req.body as StartImportBody)
    });
};

export const cancelImport = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await datasets.cancelImport(accessFor(req, res), idOf(req)) });
};

export const listItems = async (req: Request, res: Response): Promise<void> => {
  const data = await items.listItems(accessFor(req, res), idOf(req), req.query as unknown as ListItemsQuery);
  res.json({ success: true, data });
};

export const getItem = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await items.getItem(accessFor(req, res), idOf(req), String(req.params.itemId)) });
};

export const getSitemap = async (_req: Request, res: Response): Promise<void> => {
  res
    .status(200)
    .set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' })
    .send(await datasetSitemap());
};
