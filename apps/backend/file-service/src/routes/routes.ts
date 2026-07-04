import express, { Router } from 'express';
import { requireApiKey, requireSignedToken } from '../middleware/auth';
import { generateUploadUrl, generateDownloadUrl } from '../controllers/signedUrlController';
import { uploadPublic, downloadPublic } from '../controllers/publicController';
import {
  internalUpload,
  internalDownload,
  internalExists,
  internalMetadata,
  internalDelete,
  internalDeleteFolder,
  internalList
} from '../controllers/internalController';
import { validateRequest } from '@visin/backend-core';
import {
  deleteFolderBodySchema,
  listFilesQuerySchema,
  generateUploadUrlBodySchema,
  generateDownloadUrlBodySchema
} from '../validation/fileSchemas';

const router = Router();

// ─── Internal: signed URL generation (called by album-service) ────────────────
// Requires API key header: X-Internal-Api-Key
router.post(
  '/internal/upload-url',
  requireApiKey,
  express.json(),
  validateRequest({ body: generateUploadUrlBodySchema }),
  generateUploadUrl
);
router.post(
  '/internal/download-url',
  requireApiKey,
  express.json(),
  validateRequest({ body: generateDownloadUrlBodySchema }),
  generateDownloadUrl
);

// ─── Internal: server-to-server file operations ───────────────────────────────
// must be before /:fileId — otherwise the wildcard route below would shadow it
router.put(
  '/internal/files/folder',
  requireApiKey,
  express.json(),
  validateRequest({ body: deleteFolderBodySchema }),
  internalDeleteFolder
);
router.delete(
  '/internal/files/folder',
  requireApiKey,
  express.json(),
  validateRequest({ body: deleteFolderBodySchema }),
  internalDeleteFolder
);
router.get('/internal/files', requireApiKey, validateRequest({ query: listFilesQuerySchema }), internalList);
router.put('/internal/files/*fileId', requireApiKey, internalUpload);
router.get('/internal/meta/*fileId', requireApiKey, internalMetadata);
router.head('/internal/files/*fileId', requireApiKey, internalExists);
router.get('/internal/files/*fileId', requireApiKey, internalDownload);
router.delete('/internal/files/*fileId', requireApiKey, internalDelete);

// ─── Public: browser-direct signed upload / download ─────────────────────────
router.put('/files/upload/*fileId', requireSignedToken('upload'), uploadPublic);
router.get('/files/download/*fileId', requireSignedToken('download'), downloadPublic);

export default router;
