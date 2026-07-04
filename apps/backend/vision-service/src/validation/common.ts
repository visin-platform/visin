import { z } from '@visin/backend-core';

/** page/limit query params — left optional (no default) since several list
 * endpoints branch on whether pagination was requested at all vs. returning
 * everything; only defaulting sort direction/field is safe to do unconditionally. */
export const paginationSchema = {
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
};

/** Validates 'asc'|'desc' and transforms it straight to the Mongo sort direction. */
export const sortOrderSchema = (fallback: 'asc' | 'desc' = 'desc') =>
  z.enum(['asc', 'desc']).default(fallback).transform((v): 1 | -1 => (v === 'desc' ? -1 : 1));

/**
 * A single-value query param that tolerates being repeated (`?x=a&x=b`
 * arrives as `string[]`) by taking the first value, instead of rejecting it —
 * matches how these params were read with a manual `typeof x === 'string' ? x
 * : Array.isArray(x) ? x[0] : undefined` helper before validation existed.
 */
export const looseStringParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => (Array.isArray(v) ? v[0] : v));
