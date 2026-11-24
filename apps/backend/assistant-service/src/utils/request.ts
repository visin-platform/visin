import { type Request } from 'express';
import { id } from '../validation/commonSchemas';
import { parsed } from '../validation/parse';

export const actorName = (req: Request): string => req.user!.name || req.user!.email?.split('@')[0] || 'You';
export const paramId = (req: Request) => parsed(id, req.params.id);
