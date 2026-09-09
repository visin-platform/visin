import { z } from '@visin/backend-core';

/**
 * Presentation metadata only — never a gate on incoming results. A pipeline posting
 * a class or condition this project has never named still succeeds; the reader
 * discovers it. See models/taxonomy.ts.
 */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex code like #1976d2');

export const taxonomyTermSchema = z.object({
  key: z.string().trim().min(1, 'Key is required').max(100),
  label: z.string().trim().max(100).optional(),
  color: hexColor.optional(),
  order: z.number().int().optional()
});

export const taxonomyMetricSchema = z.object({
  key: z.string().trim().min(1, 'Key is required').max(100),
  label: z.string().trim().max(100).optional(),
  direction: z.enum(['higher', 'lower']).optional(),
  decimals: z.number().int().min(0).max(10).optional(),
  format: z.enum(['number', 'percent', 'ms', 'fps']).optional()
});

export const taxonomySchema = z.object({
  conditionLabel: z.string().trim().max(50).optional(),
  conditions: z.array(taxonomyTermSchema).optional(),
  classes: z.array(taxonomyTermSchema).optional(),
  metrics: z.array(taxonomyMetricSchema).optional(),
  overallMetrics: z.array(z.string().trim().min(1)).optional(),
  taskType: z.enum(['segmentation', 'detection', 'classification', 'other']).optional(),
  exportPathPrefix: z.string().trim().max(200).optional()
});

export type TaxonomyInput = z.infer<typeof taxonomySchema>;

/**
 * Per-project cost rates. Absent fields fall back to the platform defaults, so a
 * project that never sets these behaves exactly as before.
 */
export const costingSchema = z.object({
  cpuRatePerHour: z.number().min(0).optional(),
  gpuRatePerHour: z.number().min(0).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code, e.g. EUR')
    .optional()
});

export type CostingInput = z.infer<typeof costingSchema>;
