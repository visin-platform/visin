import { z } from '@visin/backend-core';

// `size` and the download location are never client-supplied: the first is
// derived from the stored file's metadata, the second is the `fileId` issued by
// POST /analysis/upload-url.
export const uploadAnalysisBodySchema = z.object({
  dataset: z.string().min(1, 'Missing required field: dataset'),
  fileId: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional()
});

// Every field is optional so a rename doesn't have to round-trip (and risk
// clobbering) the analysis JSON; only what's sent is written.
export const updateAnalysisBodySchema = z.object({
  dataset: z.string().min(1, 'Dataset name cannot be empty').optional(),
  fileId: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional()
});

// `dataset` present means "reserve the record for this new dataset now, before
// the upload starts"; absent means the URL is for replacing an existing
// analysis's archive, which needs no reservation.
export const analysisUploadUrlBodySchema = z.object({
  filename: z.string().min(1, 'Missing required field: filename'),
  mimetype: z.string().min(1).default('application/octet-stream'),
  dataset: z.string().min(1, 'Dataset name cannot be empty').optional()
});
export type AnalysisUploadUrlBody = z.infer<typeof analysisUploadUrlBodySchema>;

export const getAllAnalysesQuerySchema = z.object({
  dataset: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  skip: z.coerce.number().int().nonnegative().default(0)
});
export type GetAllAnalysesQuery = z.infer<typeof getAllAnalysesQuerySchema>;

export const getAnalysisByDatasetQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  skip: z.coerce.number().int().nonnegative().default(0)
});
export type GetAnalysisByDatasetQuery = z.infer<typeof getAnalysisByDatasetQuerySchema>;

export const compareAnalysesBodySchema = z.object({
  analysisIds: z
    .array(z.string())
    .min(1, 'Analysis IDs array is required')
    .max(10, 'Maximum 10 analyses can be compared at once')
});
