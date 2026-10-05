import type { Request, Response } from 'express';
import * as paperService from '../services/paperService';
import type { CreatePaperBody, MyPapersQuery, PublicPapersQuery, UpdatePaperBody } from '../validation/paperSchemas';

/** The public paper catalogue, a page at a time; the same for everyone who asks. */
export const getPublicPapers = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await paperService.listPublicPapers(req.query as unknown as PublicPapersQuery) });
};

/** The caller's own papers, or their trash. */
export const getMyPapers = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await paperService.listMyPapers(req.user!.id, req.query as unknown as MyPapersQuery) });
};

export const getPaper = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await paperService.getPaper(String(req.params.id), req.user?.id) });
};

export const createPaper = async (req: Request, res: Response): Promise<void> => {
  const paper = await paperService.createPaper(req.user!.id, req.body as CreatePaperBody);
  res.status(201).json({ success: true, message: 'Paper created successfully', data: paper });
};

export const updatePaper = async (req: Request, res: Response): Promise<void> => {
  const paper = await paperService.updatePaper(String(req.params.id), req.user!.id, req.body as UpdatePaperBody);
  res.json({ success: true, message: 'Paper updated successfully', data: paper });
};

export const deletePaper = async (req: Request, res: Response): Promise<void> => {
  await paperService.trashPaper(String(req.params.id), req.user!.id);
  res.json({ success: true, message: 'Paper moved to the trash' });
};

export const restorePaper = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await paperService.restorePaper(String(req.params.id), req.user!.id) });
};

/** What names the caller as an author and waits for their answer. */
export const getAuthorshipRequests = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await paperService.listAuthorshipRequests(req.user!.id) });
};

export const answerAuthorship = async (req: Request, res: Response): Promise<void> => {
  const { linked } = req.body as { linked: boolean };
  res.json({ success: true, data: await paperService.setAuthorship(String(req.params.id), req.user!.id, linked) });
};
