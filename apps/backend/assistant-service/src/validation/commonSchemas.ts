import { z } from 'zod';

export const id = z.string().regex(/^[a-f\d]{24}$/i);
