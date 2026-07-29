/**
 * File Service Client
 * All file storage goes through the local file-service API (disk-backed).
 */
import { logger, fetchWithTimeout, TRANSFER_FETCH_TIMEOUT_MS } from '@visin/backend-core';

const FILE_SERVICE_URL = (): string => {
  // Use internal service URL for server-to-server communication
  const url = process.env.FILE_SERVICE_URL || 'http://file-service:5002';
  return url.replace(/\/$/, '');
};

const FILE_SERVICE_API_KEY = (): string => {
  return process.env.FILE_SERVICE_API_KEY || '';
};

export interface SignedUrlData {
  signedUrl: string;
  expiresAt: string;
  expiresInMinutes: number;
}

export interface FileUploadResult {
  fileId: string;
  bucket: string;
  key: string;
  size: number;
  etag: string;
}

export interface FileMetadata {
  size: number;
  lastModified: string;
  etag: string;
  contentType: string;
  metadata: Record<string, unknown>;
}

interface UploadFileResponse {
  fileId: string;
}

interface DownloadUrlResponse {
  success: boolean;
  data?: { downloadUrl: string; expiresMs: number };
}

interface UploadUrlResponse {
  success: boolean;
  data?: { uploadUrl: string };
}

interface DeleteFolderResponse {
  count?: number;
}

interface FileMetadataResponse {
  data: { size: number; lastModified: string };
}

interface ListFilesResponse {
  data?: unknown[];
}

/**
 * Generate a secure file ID for storage with organized folder structure
 */
export const generateFileId = (
  userId: string | undefined,
  albumId: string,
  originalFilename: string,
  groupId?: string
): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = originalFilename.split('.').pop();
  // Create organized path: groupId/albumId/fileId/original.extension
  const topLevelId = groupId || userId || 'anonymous';
  const fileId = `${timestamp}-${random}`;
  return `${topLevelId}/${albumId}/${fileId}/original.${extension}`;
};

/**
 * Generate a thumbnail file ID for storage with organized folder structure
 */
export const generateThumbnailFileId = (
  userId: string | undefined,
  albumId: string,
  originalFilename: string,
  groupId?: string
): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  // Create organized path: groupId/albumId/fileId/thumbnail.jpg
  const topLevelId = groupId || userId || 'anonymous';
  const fileId = `${timestamp}-${random}`;
  return `${topLevelId}/${albumId}/${fileId}/thumbnail.jpg`;
};

/**
 * Generate thumbnail file ID from an existing file ID
 * Extracts the fileId part and creates the corresponding thumbnail path
 */
export const generateThumbnailFileIdFromFileId = (fileId: string): string => {
  // fileId format: groupId/albumId/fileId/original.extension
  // We want: groupId/albumId/fileId/thumbnail.jpg
  const parts = fileId.split('/');
  if (parts.length >= 4) {
    // Remove the last part (original.extension) and add thumbnail.jpg
    parts[parts.length - 1] = 'thumbnail.jpg';
    return parts.join('/');
  }
  // Fallback for old format
  return fileId.replace(/\/original\.[^.]+$/, '/thumbnail.jpg');
};

/**
 * Get the folder path for a file (for deletion)
 */
export const getFileFolder = (fileId: string): string => {
  // fileId format: groupId/albumId/fileId/original.extension
  // We want: groupId/albumId/fileId/
  const parts = fileId.split('/');
  if (parts.length >= 4) {
    return parts.slice(0, -1).join('/') + '/';
  }
  return fileId;
};

/**
 * Upload file directly to file-service using internal API
 */
export const uploadFile = async (
  fileBuffer: Buffer,
  fileId: string,
  mimetype: string,
  size: number
): Promise<FileUploadResult> => {
  try {
    const response = await fetchWithTimeout(`${FILE_SERVICE_URL()}/internal/files/${fileId}`, {
      method: 'PUT',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': mimetype,
        'Content-Length': String(size)
      },
      body: fileBuffer,
      // Moves file bytes — sized for the payload, not the control-plane default.
      timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
      serviceName: 'file-service'
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    const result = await response.json() as UploadFileResponse;

    logger.info('File uploaded successfully', { fileId, bucket: 'vision', size });

    return {
      fileId,
      bucket: 'vision',
      key: fileId,
      size,
      etag: result.fileId // Use fileId as etag
    };
  } catch (error) {
    logger.error('Failed to upload file to file-service', { fileId, error: (error as Error).message });
    throw new Error('File upload failed', { cause: error });
  }
};

/**
 * Get a signed URL for a stored image, picking the original or the thumbnail.
 */
export const getPhotoSignedUrl = async (
  image: { fileId?: string; thumbnailFileId?: string },
  isThumbnail: boolean = false,
  expiresInMinutes: number = 60
): Promise<SignedUrlData | null> => {
  const fileIdToUse = isThumbnail ? image.thumbnailFileId : image.fileId;
  if (!fileIdToUse) return null;
  return await getSignedUrl(fileIdToUse, expiresInMinutes);
};

/**
 * Get signed download URL from file-service
 */
export const getSignedUrl = async (
  fileId: string,
  expiresInMinutes: number = 60
): Promise<SignedUrlData | null> => {
  try {
    const response = await fetchWithTimeout(`${FILE_SERVICE_URL()}/internal/download-url`, {
      method: 'POST',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileId, expiresInMinutes }),
      serviceName: 'file-service'
    });

    if (!response.ok) {
      throw new Error(`Failed to generate signed URL with status ${response.status}`);
    }

    const data = await response.json() as DownloadUrlResponse;

    if (!data.success || !data.data) {
      throw new Error('Invalid response from file-service');
    }

    return {
      signedUrl: data.data.downloadUrl,
      expiresAt: new Date(data.data.expiresMs).toISOString(),
      expiresInMinutes
    };
  } catch (error) {
    logger.error('Failed to generate signed URL', { fileId, error: (error as Error).message });
    // Don't throw error, return null instead to prevent service crash
    return null;
  }
};

/**
 * Get signed URLs for multiple images in batch, keyed by the original `fileId`
 * (also for thumbnails, so callers can look both up off the same image).
 */
export const getPhotoSignedUrlsBatch = async (
  images: Array<{ fileId?: string; thumbnailFileId?: string }>,
  isThumbnail: boolean = false,
  expiresInMinutes: number = 60
): Promise<Record<string, SignedUrlData>> => {
  const result: Record<string, SignedUrlData> = {};

  // Process in parallel with concurrency limit
  const concurrencyLimit = 10;
  for (let i = 0; i < images.length; i += concurrencyLimit) {
    const batch = images.slice(i, i + concurrencyLimit);
    const batchPromises = batch.map(async (image) => {
      try {
        const signedUrlData = await getPhotoSignedUrl(image, isThumbnail, expiresInMinutes);
        if (signedUrlData && image.fileId) {
          result[image.fileId] = signedUrlData;
        }
      } catch (error) {
        logger.warn('Failed to get signed URL for image', { fileId: image.fileId, error: (error as Error).message });
        // Continue with other images
      }
    });

    await Promise.all(batchPromises);
  }

  return result;
};

/**
 * Generate signed URL for file upload (direct client upload)
 */
export const getUploadSignedUrl = async (
  fileId: string,
  mimetype: string,
  expiresInMinutes: number = 15
): Promise<string> => {
  try {
    const response = await fetchWithTimeout(`${FILE_SERVICE_URL()}/internal/upload-url`, {
      method: 'POST',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileId, expiresInMinutes }),
      serviceName: 'file-service'
    });

    if (!response.ok) {
      throw new Error(`Failed to generate upload URL with status ${response.status}`);
    }

    const data = await response.json() as UploadUrlResponse;

    if (!data.success || !data.data) {
      throw new Error('Invalid response from file-service');
    }

    logger.info('Generated upload URL', { fileId, expiresIn: expiresInMinutes, mimetype });

    return data.data.uploadUrl;
  } catch (error) {
    logger.error('Failed to generate upload URL', { fileId, error: (error as Error).message });
    throw new Error('Failed to generate upload URL', { cause: error });
  }
};

/**
 * Delete file from file-service
 */
export const deleteFile = async (fileId: string): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(`${FILE_SERVICE_URL()}/internal/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
      },
      serviceName: 'file-service'
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Delete failed with status ${response.status}`);
    }

    logger.info('File deleted successfully', { fileId });
    return true;
  } catch (error) {
    logger.error('Failed to delete file', { fileId, error: (error as Error).message });
    return false;
  }
};

/**
 * Delete folder (all objects with prefix) from file-service
 */
export const deleteFolder = async (folderPrefix: string): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(`${FILE_SERVICE_URL()}/internal/files/folder`, {
      method: 'DELETE',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefix: folderPrefix }),
      serviceName: 'file-service'
    });

    if (!response.ok) {
      throw new Error(`Delete folder failed with status ${response.status}`);
    }

    const data = await response.json() as DeleteFolderResponse;

    logger.info('Folder deleted successfully', { folderPrefix, count: data.count || 0 });

    return true;
  } catch (error) {
    logger.error('Failed to delete folder', { folderPrefix, error: (error as Error).message });
    return false;
  }
};

/**
 * Check if file exists
 */
export const fileExists = async (fileId: string): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(`${FILE_SERVICE_URL()}/internal/files/${fileId}`, {
      method: 'HEAD',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
      },
      serviceName: 'file-service'
    });

    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Get file metadata
 */
export const getFileMetadata = async (fileId: string): Promise<FileMetadata> => {
  try {
    const response = await fetchWithTimeout(`${FILE_SERVICE_URL()}/internal/meta/${fileId}`, {
      method: 'GET',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
      },
      serviceName: 'file-service'
    });

    if (!response.ok) {
      throw new Error('File not found');
    }

    const data = await response.json() as FileMetadataResponse;

    return {
      size: data.data.size,
      lastModified: data.data.lastModified,
      etag: fileId,
      contentType: 'application/octet-stream',
      metadata: {}
    };
  } catch (error) {
    logger.error('Failed to get metadata', { fileId, error: (error as Error).message });
    throw new Error('File not found', { cause: error });
  }
};

/**
 * List files with optional prefix
 */
export const listFiles = async (prefix?: string, maxKeys: number = 1000): Promise<unknown[]> => {
  try {
    const params = new URLSearchParams();
    if (prefix) params.append('prefix', prefix);
    params.append('maxKeys', String(maxKeys));

    const response = await fetchWithTimeout(
      `${FILE_SERVICE_URL()}/internal/files?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
        },
        serviceName: 'file-service'
      }
    );

    if (!response.ok) {
      throw new Error('Failed to list files');
    }

    const data = await response.json() as ListFilesResponse;

    return data.data || [];
  } catch (error) {
    logger.error('Failed to list files', { error: (error as Error).message });
    throw new Error('Failed to list files', { cause: error });
  }
};

/**
 * Copy file (no-op for now, not needed for local storage)
 */
export const copyFile = async (
  sourceKey: string,
  destinationKey: string
): Promise<void> => {
  logger.info('File copy requested (not implemented)', { sourceKey, destinationKey });
  // Could implement if needed by downloading and re-uploading
};
