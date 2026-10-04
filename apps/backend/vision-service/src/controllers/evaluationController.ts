import { Response } from 'express';
import * as evaluationService from '../services/evaluationService';
import * as moderation from '../services/moderationService';
import * as recorded from '../services/recordedLeaderboardService';
import { AuthRequest } from '../middleware/authMiddleware';
import type { VerifyEvaluationBody, RecordedLeaderboardQuery, EvaluationBody, HideEvaluationBody, ListEvaluationsQuery, PromoteEvaluationBody } from '../validation/evaluationSchemas';

export const getRecordedLeaderboard = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await recorded.recordedLeaderboard(req.user?.id, req.query as unknown as RecordedLeaderboardQuery) });
};

export const verifyEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await recorded.verifyEvaluation(req.params.id as string, req.user?.id, (req.body as VerifyEvaluationBody).verified) });
};

export const checkEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await evaluationService.checkEvaluation(req.user?.id, req.body as EvaluationBody) });
};

/** 201 for a new evaluation; 200 with the stored one when the same result was already recorded under this uuid. */
export const createEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  const { evaluation, created } = await evaluationService.createEvaluation(req.user?.id, req.body as EvaluationBody);
  res
    .status(created ? 201 : 200)
    .json({ success: true, message: created ? 'Evaluation recorded' : 'Evaluation already recorded', data: evaluation });
};

export const getEvaluations = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await evaluationService.listEvaluations(req.user?.id, req.query as unknown as ListEvaluationsQuery) });
};

export const getEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await evaluationService.getEvaluation(req.params.id as string, req.user?.id) });
};

export const getEvaluationByUuid = async (req: AuthRequest, res: Response): Promise<void> => {
  const { projectId } = req.query as unknown as { projectId: string };
  res.json({ success: true, data: await evaluationService.getEvaluationByUuid(req.params.uuid as string, projectId, req.user?.id) });
};

export const trashEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await evaluationService.setEvaluationTrashed(req.params.id as string, req.user?.id, true) });
};

export const restoreEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await evaluationService.setEvaluationTrashed(req.params.id as string, req.user?.id, false) });
};

/** 201 for a new evaluation; 200 with the one already promoted from this test result onto this suite. */
export const promoteEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  const { evaluation, created } = await evaluationService.promoteEvaluation(req.user?.id, req.body as PromoteEvaluationBody);
  res
    .status(created ? 201 : 200)
    .json({ success: true, message: created ? 'Result promoted' : 'Result already promoted', data: evaluation });
};

export const publishEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await evaluationService.setEvaluationPublished(req.params.id as string, req.user?.id, true) });
};

export const withdrawEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await evaluationService.setEvaluationPublished(req.params.id as string, req.user?.id, false) });
};

export const approveEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await moderation.approveEvaluation(req.params.id as string, req.user?.id) });
};

export const hideEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await moderation.hideEvaluation(req.params.id as string, req.user?.id, (req.body as HideEvaluationBody).reason) });
};

export const unhideEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await moderation.unhideEvaluation(req.params.id as string, req.user?.id) });
};
