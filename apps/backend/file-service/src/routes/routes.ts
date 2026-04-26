import { Router } from 'express';
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

const router = Router();

// ─── Internal: signed URL generation (called by album-service) ────────────────
// Requires API key header: X-Internal-Api-Key
router.post('/internal/upload-url', requireApiKey, generateUploadUrl);
router.post('/internal/download-url', requireApiKey, generateDownloadUrl);

// ─── Internal: server-to-server file operations ───────────────────────────────
router.put('/internal/files/folder', requireApiKey, internalDeleteFolder); // must be before /:fileId
router.delete('/internal/files/folder', requireApiKey, internalDeleteFolder);
router.get('/internal/files', requireApiKey, internalList);
router.put('/internal/files/*fileId', requireApiKey, internalUpload);
router.get('/internal/meta/*fileId', requireApiKey, internalMetadata);
router.head('/internal/files/*fileId', requireApiKey, internalExists);
router.get('/internal/files/*fileId', requireApiKey, internalDownload);
router.delete('/internal/files/*fileId', requireApiKey, internalDelete);

// ─── Public: browser-direct signed upload / download ─────────────────────────
router.put('/files/upload/*fileId', requireSignedToken('upload'), uploadPublic);
router.get('/files/download/*fileId', requireSignedToken('download'), downloadPublic);

export default router;
