import { Response } from 'express';
import * as evaluationService from '../services/evaluationService';
import * as moderation from '../services/moderationService';
import * as suiteService from '../services/suiteService';
import type { SuiteLeaderboardQuery } from '../validation/evaluationSchemas';
import { AuthRequest } from '../middleware/authMiddleware';
import type { CheckSuiteBody, CreateSuiteBody, ListSuitesQuery, SuiteParams, UpdateSuiteBody } from '../validation/suiteSchemas';

export const getSuites = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await suiteService.listSuites(req.user?.id, req.query as unknown as ListSuitesQuery)
  });
};

export const getSuite = async (req: AuthRequest, res: Response): Promise<void> => {
  const { slug, version } = req.params as unknown as SuiteParams;
  res.json({ success: true, data: await suiteService.getSuite(slug, version, req.user?.id) });
};

/** The digest of a protocol file, stored nowhere: what an evaluator records as the protocol it ran. */
export const checkSuite = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: suiteService.checkSuiteProtocol(req.user?.id, req.body as CheckSuiteBody) });
};

/** 201 for a new version; 200 with the stored one when the same protocol was already published. */
export const createSuite = async (req: AuthRequest, res: Response): Promise<void> => {
  const { suite, created } = await suiteService.createSuite(req.user?.id, req.body as CreateSuiteBody);
  res
    .status(created ? 201 : 200)
    .json({ success: true, message: created ? 'Suite published' : 'Suite already published', data: suite });
};

export const updateSuite = async (req: AuthRequest, res: Response): Promise<void> => {
  const { slug, version } = req.params as unknown as { slug: string; version: number };
  res.json({
    success: true,
    data: await suiteService.updateSuite(slug, version, req.user?.id, req.body as UpdateSuiteBody)
  });
};

/** Ranked evaluations of one suite version, over the ones the caller may read. */
export const getSuiteLeaderboard = async (req: AuthRequest, res: Response): Promise<void> => {
  const { slug, version } = req.params as unknown as SuiteParams;
  res.json({
    success: true,
    data: await evaluationService.suiteLeaderboard(
      slug,
      version,
      req.user?.id,
      req.query as unknown as SuiteLeaderboardQuery
    )
  });
};

/** What waits for approval on a suite, and what was hidden from it: for a manager of the suite's project. */
export const getSuiteSubmissions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { slug, version } = req.params as unknown as { slug: string; version: number };
  res.json({ success: true, data: await moderation.listSubmissions(slug, version, req.user?.id) });
};
