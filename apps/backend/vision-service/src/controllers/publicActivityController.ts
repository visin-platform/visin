import type { Request, Response } from 'express';
import { listActivity } from '../services/activityService';
import type { ActivityQuery } from '../validation/activitySchemas';

/** What a person or a group has been doing in public; the same for everyone who asks. */
export const getPublicActivity = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listActivity(req.query as unknown as ActivityQuery) });
};
