/**
 * Backwards compatibility for the pre-file-service `minio*` field spellings.
 *
 * File storage moved from MinIO to file-service disk long ago, but the Mongo
 * documents and the HTTP field names kept the old vendor's name until the
 * `npm run migrate:minio --workspace=vision-service` migration renamed them to
 * `fileId` / `thumbnailFileId`.
 *
 * Callers we don't deploy — training pipelines posting epoch visualizations
 * with project-scoped API tokens — both send `minioFileId` on writes and read
 * it back off the upload-url response, so for one deprecation cycle requests
 * still accept the old key and responses still mirror it.
 *
 * REMOVING THIS SHIM: delete this file and every import of it. Nothing else
 * needs to change, and `grep -ri minio apps/backend/vision-service/src` should
 * come back empty afterwards.
 */
import { z } from '@visin/backend-core';

/** Legacy request/response key -> current key. */
const LEGACY_KEYS: Record<string, string> = {
  minioFileId: 'fileId',
  minioThumbnailFileId: 'thumbnailFileId'
};

/**
 * Wraps a body schema so a request sending the legacy `minioFileId` /
 * `minioThumbnailFileId` key validates as if it had sent the current name.
 * An explicit current-name key always wins.
 */
export function acceptLegacyFileIdKeys<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

    const body = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...body };
    let changed = false;

    for (const [legacyKey, currentKey] of Object.entries(LEGACY_KEYS)) {
      if (normalized[legacyKey] === undefined) continue;
      if (normalized[currentKey] === undefined) {
        normalized[currentKey] = normalized[legacyKey];
      }
      delete normalized[legacyKey];
      changed = true;
    }

    return changed ? normalized : value;
  }, schema);
}

/**
 * Mirrors the current keys back onto a response payload under their legacy
 * names. Idempotent, so it is safe to apply on a payload that already went
 * through the mongoose transform below.
 */
export function withLegacyFileIdKeys<T extends Record<string, unknown>>(payload: T): T {
  for (const [legacyKey, currentKey] of Object.entries(LEGACY_KEYS)) {
    if (payload[currentKey] !== undefined && payload[legacyKey] === undefined) {
      (payload as Record<string, unknown>)[legacyKey] = payload[currentKey];
    }
  }
  return payload;
}

/**
 * `toJSON`/`toObject` transform that applies {@link withLegacyFileIdKeys} to
 * every serialized document of a schema.
 */
export const mirrorLegacyFileIdKeys = (_doc: unknown, ret: Record<string, unknown>): Record<string, unknown> =>
  withLegacyFileIdKeys(ret);
