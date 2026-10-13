import { z } from '@visin/backend-core';
import { ANNOTATION_TOOLS, MAX_CLASSES, SENSOR_KEYS, SENSOR_KINDS, TASK_TYPES } from '../models/LabelJob';

/** A class as the wizard sends it. The key, colour and hotkey are filled in when absent. */
export const classInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'key: lowercase letters, digits, - and _')
    .optional(),
  name: z.string().trim().min(1, 'name required').max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color: #rrggbb')
    .optional(),
  hotkey: z.string().trim().length(1).optional(),
  tools: z.array(z.enum(ANNOTATION_TOOLS)).min(1).default(['box', 'mask']),
  modelClass: z.string().trim().min(1).max(60).optional()
});

export type ClassInput = z.infer<typeof classInputSchema>;

export const sensorSchema = z.object({
  key: z.enum(SENSOR_KEYS),
  /** the dataset image group the sensor's files live in */
  group: z.string().trim().min(1, 'group required').max(100),
  kind: z.enum(SENSOR_KINDS).default('image'),
  variant: z.string().trim().min(1).max(50).optional()
});

export const createJobBodySchema = z
  .object({
    name: z.string().trim().min(1, 'name required').max(120),
    description: z.string().trim().max(1000).optional(),
    /** the job follows its dataset: the dataset's managers run it, its contributors label it */
    datasetId: z.string().trim().min(1, 'datasetId required'),
    taskType: z.enum(TASK_TYPES).default('annotate'),
    sensors: z.array(sensorSchema).min(1).max(SENSOR_KEYS.length),
    classes: z.array(classInputSchema).min(1, 'at least one class').max(MAX_CLASSES),
    redundancy: z.number().int().min(1).max(10).default(1)
  })
  .superRefine((body, ctx) => {
    const cameras = body.sensors.filter((sensor) => sensor.key === 'camera');
    if (cameras.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['sensors'], message: 'exactly one camera sensor is required' });
    } else if (cameras[0].kind !== 'image') {
      ctx.addIssue({ code: 'custom', path: ['sensors'], message: 'the camera is an image sensor' });
    }
    if (new Set(body.sensors.map((sensor) => sensor.key)).size !== body.sensors.length) {
      ctx.addIssue({ code: 'custom', path: ['sensors'], message: 'each sensor may appear once' });
    }
  });

export type CreateJobBody = z.infer<typeof createJobBodySchema>;

export const jobVisibilityBodySchema = z.object({ isPublic: z.boolean() });

/** Explicit detector names per job class; null restores matching by the class's own name. */
export const modelClassMappingBodySchema = z.object({
  mapping: z.record(z.string().min(1).max(40), z.string().trim().min(1).max(60).nullable())
    .refine((mapping) => Object.keys(mapping).length > 0 && Object.keys(mapping).length <= MAX_CLASSES, 'send 1 to 100 class mappings')
});
export type ModelClassMappingBody = z.infer<typeof modelClassMappingBodySchema>;

export const listJobsQuerySchema = z.object({
  role: z.enum(['worker', 'admin']).default('worker')
});

export const materializeBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('manifest'),
    content: z.string().min(1).optional(), // absent → use the dataset's manifest
    format: z.enum(['csv', 'jsonl']).optional()
  }),
  z.object({
    kind: z.literal('filter'),
    sampleN: z.number().int().positive().optional(), // absent → all frames
    seed: z.number().int().optional()
  })
]);

export type MaterializeBody = z.infer<typeof materializeBodySchema>;

/** The formats a job's labels can leave or enter as. Their descriptions live with the format modules. */
export const FORMAT_IDS = ['yolo', 'coco', 'voc', 'semantic-png', 'visin'] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export const exportQuerySchema = z.object({
  format: z.enum([...FORMAT_IDS, 'manifest']).default('visin'),
  /** `done` (default): frames an annotator finished. `all`: drafts too. */
  include: z.enum(['done', 'all']).default('done')
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;

/**
 * Where an imported class goes: the key of a job class, `"+"` to add it to the job
 * as a new class, or `null` to leave its labels out. A class not mentioned is
 * matched to a job class by name, and left out when none matches.
 */
export const classMapSchema = z.record(z.string(), z.string().nullable());

export const importQuerySchema = z.object({
  dryRun: z.enum(['true', 'false']).default('false'),
  /** `suggestions`: annotators confirm them. `done`: trusted, counted as finished. */
  as: z.enum(['suggestions', 'done']).default('suggestions'),
  /** the format, when detection should be overruled */
  format: z.enum(FORMAT_IDS).optional(),
  /** JSON-encoded `classMap` — the body is the zip itself, so options travel in the query */
  classMap: z
    .string()
    .max(20000)
    .optional()
    .transform((value, ctx) => {
      if (!value) return {} as Record<string, string | null>;
      try {
        const parsed = classMapSchema.safeParse(JSON.parse(value));
        if (parsed.success) return parsed.data;
      } catch {
        // fall through to the issue below
      }
      ctx.addIssue({ code: 'custom', message: 'classMap must be a JSON object of class name → class key, "+" or null' });
      return z.NEVER;
    })
});

export type ImportQuery = z.infer<typeof importQuerySchema>;
