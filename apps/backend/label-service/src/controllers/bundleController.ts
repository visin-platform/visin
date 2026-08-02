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

export const updateBundle = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const updated = await svc.updateBundle(bundle._id.toString(), req.body);
  res.json({ success: true, data: updated });
};

export const maskFields = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertMember(req, bundle.groupId);
  const fields = await svc.maskFields(bundle._id.toString(), req.query.set as string);
  res.json({ success: true, data: fields });
};

export const createUploadUrl = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const data = await svc.createUploadUrl(bundle._id.toString());
  res.json({ success: true, data });
};

export const listUploads = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const uploads = await svc.listUploads(bundle._id.toString());
  res.json({ success: true, data: uploads });
};

export const previewImport = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const preview = await svc.previewImport(bundle._id.toString(), req.body.zipFileId);
  res.json({ success: true, data: preview });
};

export const startImport = async (req: Request, res: Response): Promise<void> => {
  const bundle = await svc.getBundle(req.params.id as string);
  await assertAdmin(req, bundle.groupId);
  const importJob = await svc.startImport(bundle._id.toString(), req.body.zipFileId, req.body.mapping);
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
