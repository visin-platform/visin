/**
 * MinIO Service (Deprecated - Migrated to File Service Client)
 * 
 * This file now re-exports from fileServiceClient for backward compatibility.
 * All file operations now use the local file-service instead of MinIO.
 * 
 * To migrate code using this module:
 * - All imports continue to work as before
 * - The implementation now calls file-service API internally
 * - No breaking changes for existing code
 */

export {
  generateFileId,
  generateThumbnailFileId,
  generateThumbnailFileIdFromFileId,
  getFileFolder,
  uploadFile,
  getPhotoSignedUrl,
  getSignedUrl,
  getPhotoSignedUrlsBatch,
  getUploadSignedUrl,
  deleteFile,
  deleteFolder,
  fileExists,
  getFileMetadata,
  listFiles,
  copyFile,
  type SignedUrlData,
  type FileUploadResult
} from './fileServiceClient';