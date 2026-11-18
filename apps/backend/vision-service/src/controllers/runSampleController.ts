import type { Request, Response } from 'express';
import { listRunSamples, writeRunSamples } from '../services/runSampleService';
import type { ListRunSamplesQuery } from '../validation/runSampleSchemas';

export async function getRunSamples(req: Request, res: Response): Promise<void> {
  const data = await listRunSamples(req.params.id as string, req.user?.id, req.query as unknown as ListRunSamplesQuery);
  res.json({ success: true, data });
}

export async function postRunSamples(req: Request, res: Response): Promise<void> {
  const data = await writeRunSamples(req.params.id as string, req.user?.id, req.body.samples);
  res.json({ success: true, data });
}
