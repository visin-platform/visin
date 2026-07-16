import { Request, Response } from 'express';
import * as svc from '../services/bundleService';
import { assertAdmin, assertMember, requireUser } from '../services/groupAccessService';

export const createBundle = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  await assertAdmin(req, req.body.groupId);
  const bundle = await svc.createBundle(user, req.body);
  res.status(201).json({ success: true, data: bundle });
};

export const listBundles = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const bundles = await svc.listBundlesForUser(user.email!.toLowerCase());
  res.json({ success: true, data: bundles });
};

export const getBundle = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertMember(req, bundle.groupId);
  res.json({ success: true, data: bundle });
};

export const createUploadUrl = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const data = await svc.createUploadUrl(bundle._id.toString());
  res.json({ success: true, data });
};

export const startImport = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const importJob = await svc.startImport(bundle._id.toString(), req.body.zipFileId);
  res.status(202).json({ success: true, data: importJob });
};

export const getImport = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const importJob = await svc.getImport(bundle._id.toString(), req.params.importId as string);
  res.json({ success: true, data: importJob });
};

export const deleteImport = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  await svc.deleteImport(bundle._id.toString(), req.params.importId as string);
  res.json({ success: true });
};

export const deleteBundle = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  await svc.deleteBundle(bundle._id.toString());
  res.json({ success: true });
};
