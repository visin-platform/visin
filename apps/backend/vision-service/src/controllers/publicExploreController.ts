import type { Request, Response } from 'express';
import { listPublicFindings, listPublicProjects } from '../services/exploreService';
import type { PublicFindingsQuery, PublicProjectsQuery } from '../validation/exploreSchemas';

/** The public project catalogue, a page at a time; the same for everyone who asks. */
export const getPublicProjects = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listPublicProjects(req.query as unknown as PublicProjectsQuery) });
};

/** The latest findings in public projects; the same for everyone who asks. */
export const getPublicFindings = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listPublicFindings(req.query as unknown as PublicFindingsQuery) });
};
