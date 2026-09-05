import { Request, Response } from 'express';
import { UnauthorizedError, listToolCalls, summariseToolUsage } from '@visin/backend-core';

/**
 * What a connected assistant has been doing, and what it cost.
 *
 * Scoped to the caller by the session, like the API keys and connections it
 * sits beside — never by anything in the request. An account-wide view would be
 * a different route behind `requireRole('admin')`, not a parameter here.
 */

const requireUserId = (req: Request): string => {
  if (!req.user?.id) throw new UnauthorizedError('Not authenticated');
  return req.user.id;
};

/** Days of history a summary covers when the caller does not say. */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * Per-tool totals, worst first.
 *
 * The question this answers is "which tool should I shrink", so it is ordered
 * by total tokens rather than by call count — a tool called twice that returns
 * a whole epoch series costs more than a hundred cheap lookups.
 */
export const getToolUsage = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  const { days } = req.query as { days?: string };

  const windowDays = Number(days) > 0 ? Math.min(Number(days), 365) : DEFAULT_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  res.json({
    success: true,
    data: { windowDays, usage: await summariseToolUsage(userId, since) }
  });
};

/** The individual calls, newest first — "what did it just do". */
export const getToolCalls = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  const { limit } = req.query as { limit?: string };

  const rows = Number(limit) > 0 ? Math.min(Number(limit), 500) : 100;

  res.json({ success: true, data: await listToolCalls(userId, rows) });
};
