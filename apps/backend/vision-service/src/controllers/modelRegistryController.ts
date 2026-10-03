import type { Request, Response } from 'express';
import { listModels } from '../services/modelRegistryService';
import type { ListModelsQuery } from '../validation/modelRegistrySchemas';

// Hub models linked to runs the caller may see
export const getModels = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listModels(req.user?.id, req.query as unknown as ListModelsQuery) });
};
