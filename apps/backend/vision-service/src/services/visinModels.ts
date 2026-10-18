import { Schema } from 'mongoose';
import { licenseSchema, z } from '@visin/backend-core';
import type { LocalCheckpoint } from './sourceRegistry';

/**
 * A model whose bytes this deployment keeps itself: a checkpoint the training pipeline uploaded, as `.pth` weights or
 * an `.onnx` export. The run's link says what the bytes are (format, size, digest, licence, how to preprocess an
 * input); the bytes are in file-service. Nothing here imports a service, so the Training model can load it.
 */
export const VISIN = 'visin' as const;

export const MODEL_FORMATS = ['pth', 'onnx'] as const;

/** The kinds of a model's outputs: each is a visualization `type` a run uploaded against the model's epoch. */
export const OUTPUT_FOLDER_NAMES = ['mask', 'segment', 'confidence'] as const;
export type OutputFolder = (typeof OUTPUT_FOLDER_NAMES)[number];
export type ModelFormat = (typeof MODEL_FORMATS)[number];

/** `verifying` until the stored file has been read once and its digest recorded; only `ready` is served. */
export const MODEL_STATUSES = ['verifying', 'ready', 'failed'] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_MODEL_INFO_BYTES = 64 * 1024;

const sha256Schema = z.string().regex(SHA256_PATTERN, 'Expected a 64-character lowercase hex SHA-256');

/**
 * What a pipeline claims once its upload has finished. `modelInfo` is what the weights record about the network and its
 * input (visin-fusion's `model_info`); Visin keeps it as given and never reads a field of it.
 */
export const visinModelLinkSchema = z
  .object({
    provider: z.literal(VISIN),
    kind: z.literal('model').default('model'),
    /** the file the upload reserved; what the claim attaches to this run */
    fileId: z.string().min(1).max(300),
    format: z.enum(MODEL_FORMATS),
    /** the epoch this checkpoint came from */
    epoch: z.number().int().min(0).optional(),
    /** declared by whoever publishes the model; absent means not stated, and a model with none is not served */
    license: licenseSchema.optional(),
    credit: z.string().trim().min(1).max(300).optional(),
    /** the digest the uploader computed; Visin reads the file itself and refuses the link when they differ */
    sha256: sha256Schema.optional(),
    /** for an ONNX export: the digest of the `.pth` it was made from, which is the checkpoint evaluations name */
    sourceSha256: sha256Schema.optional(),
    modelInfo: z
      .record(z.string(), z.unknown())
      .refine(
        (info) => Buffer.byteLength(JSON.stringify(info), 'utf8') <= MAX_MODEL_INFO_BYTES,
        'modelInfo is too large'
      )
      .optional(),
    /** an export's agreement with the weights it came from, on the frames it was checked on */
    parity: z
      .strictObject({
        maxAbsDiff: z.number().min(0),
        argmaxMismatchFraction: z.number().min(0).max(1),
        frames: z.number().int().min(0)
      })
      .optional()
  })
  .superRefine((link, ctx) => {
    if (link.format === 'onnx' && !link.sourceSha256) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceSha256'],
        message: 'An ONNX export must name the SHA-256 of its source weights'
      });
    }
    if (link.format === 'pth' && (link.sourceSha256 || link.parity)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceSha256'],
        message: 'sourceSha256 and parity describe only ONNX exports'
      });
    }
  });
export type VisinModelLinkInput = z.infer<typeof visinModelLinkSchema>;

/** The link as stored: what was claimed, and what Visin found out about the file. */
export type VisinModelLink = VisinModelLinkInput & {
  filename?: string;
  size?: number;
  status?: ModelStatus;
  verifyError?: string;
  verifiedAt?: Date;
  /** held while a read of the file is under way, so two workers do not hash it at once */
  verifyingUntil?: Date;
};

/** The stored fields a link of this provider adds to the model-link subdocument. */
export const visinModelLinkPaths = {
  fileId: String,
  filename: String,
  format: String,
  size: Number,
  sha256: String,
  sourceSha256: String,
  license: Schema.Types.Mixed,
  credit: String,
  modelInfo: Schema.Types.Mixed,
  parity: Schema.Types.Mixed,
  status: String,
  verifyError: String,
  verifiedAt: Date,
  verifyingUntil: Date
};

/**
 * What makes two links the same: one file per format and epoch. A retry of the same upload finds itself; a different
 * file for the same slot is not "the same link", and the caller says so.
 */
export const visinModelLinkIdentity = (link: Pick<VisinModelLinkInput, 'provider' | 'format' | 'epoch'>) => ({
  provider: link.provider,
  format: link.format,
  epoch: link.epoch ?? null
});

/** How a stored model is named to a person, and what a search matches it by. */
export const visinModelLinkLabel = (link: { filename?: string; format: string }): string =>
  link.filename ?? `${link.format} checkpoint`;

/**
 * The checkpoint a stored model stands for. Both formats of one checkpoint name the `.pth`'s digest, so evaluations
 * and leaderboards see one model. Until the file is read there is no digest, and the key is one no evaluation can have.
 */
export const visinLinkCheckpoint = (
  link: Pick<VisinModelLink, 'fileId' | 'sha256' | 'sourceSha256' | 'format' | 'filename'>
): LocalCheckpoint => {
  const digest = link.format === 'pth' ? link.sha256 : link.sourceSha256;
  return { kind: 'local', sha256: digest ?? `pending-${link.fileId}`, label: visinModelLinkLabel(link) };
};

/** The name a stored file is saved under, from what the run is called and what the file is. */
export const storedModelFilename = (runName: string, link: Pick<VisinModelLinkInput, 'format' | 'epoch'>): string => {
  const stem = runName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
  return `${stem || 'model'}${link.epoch === undefined ? '' : `-epoch${link.epoch}`}.${link.format}`;
};

/** An HTTP `Repr-Digest` value (RFC 9530) for a hex SHA-256. */
export const reprDigest = (sha256: string): string => `sha-256=:${Buffer.from(sha256, 'hex').toString('base64')}:`;
