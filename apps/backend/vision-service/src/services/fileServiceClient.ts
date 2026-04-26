/**
 * File Service Client
 * Replaces MinIO client by calling the local file-service API
 */

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
    const response = await fetch(`${FILE_SERVICE_URL()}/internal/files/${fileId}`, {
      method: 'PUT',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': mimetype,
        'Content-Length': String(size)
      },
      body: fileBuffer
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    const result = await response.json() as any;

    console.info(`File uploaded successfully: ${fileId}`, {
      bucket: 'vision',
      size
    });

    return {
      fileId,
      bucket: 'vision',
      key: fileId,
      size,
      etag: result.fileId // Use fileId as etag
    };
  } catch (error) {
    console.error('Failed to upload file to file-service:', error);
    throw new Error('File upload failed');
  }
};

/**
 * Get signed URL for photo file
 */
export const getPhotoSignedUrl = async (
  photo: { minioFileId?: string; minioThumbnailFileId?: string },
  isThumbnail: boolean = false,
  expiresInMinutes: number = 60
): Promise<SignedUrlData | null> => {
  // Use minioFileId and minioThumbnailFileId
  const fileIdToUse = isThumbnail ? photo.minioThumbnailFileId : photo.minioFileId;
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
  console.info(`Generating signed URL for ${fileId}`);

  try {
    const response = await fetch(`${FILE_SERVICE_URL()}/internal/download-url`, {
      method: 'POST',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileId, expiresInMinutes })
    });

    if (!response.ok) {
      throw new Error(`Failed to generate signed URL with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.success || !data.data) {
      throw new Error('Invalid response from file-service');
    }

    return {
      signedUrl: data.data.downloadUrl,
      expiresAt: new Date(data.data.expiresMs).toISOString(),
      expiresInMinutes
    };
  } catch (error) {
    console.error(`Failed to generate signed URL for ${fileId}:`, error);
    // Don't throw error, return null instead to prevent service crash
    return null;
  }
};

/**
 * Get signed URLs for multiple photos in batch
 */
export const getPhotoSignedUrlsBatch = async (
  photos: Array<{ minioFileId?: string; minioThumbnailFileId?: string }>,
  isThumbnail: boolean = false,
  expiresInMinutes: number = 60
): Promise<Record<string, SignedUrlData>> => {
  const result: Record<string, SignedUrlData> = {};

  // Process in parallel with concurrency limit
  const concurrencyLimit = 10;
  for (let i = 0; i < photos.length; i += concurrencyLimit) {
    const batch = photos.slice(i, i + concurrencyLimit);
    const batchPromises = batch.map(async (photo) => {
      try {
        const signedUrlData = await getPhotoSignedUrl(photo, isThumbnail, expiresInMinutes);
        // Use the actual minioFileId as the key for backward compatibility
        if (signedUrlData && photo.minioFileId) {
          result[photo.minioFileId] = signedUrlData;
        }
      } catch (error) {
        console.warn(`Failed to get signed URL for photo ${photo.minioFileId}:`, error);
        // Continue with other photos
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
  console.info(`Generating upload URL for ${fileId}`);

  try {
    const response = await fetch(`${FILE_SERVICE_URL()}/internal/upload-url`, {
      method: 'POST',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileId, expiresInMinutes })
    });

    if (!response.ok) {
      throw new Error(`Failed to generate upload URL with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.success || !data.data) {
      throw new Error('Invalid response from file-service');
    }

    console.info(`Generated upload URL for ${fileId}`, {
      expiresIn: expiresInMinutes,
      mimetype
    });

    return data.data.uploadUrl;
  } catch (error) {
    console.error(`Failed to generate upload URL for ${fileId}:`, error);
    throw new Error('Failed to generate upload URL');
  }
};

/**
 * Delete file from file-service
 */
export const deleteFile = async (fileId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${FILE_SERVICE_URL()}/internal/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
      }
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Delete failed with status ${response.status}`);
    }

    console.info(`File deleted successfully: ${fileId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete file ${fileId}:`, error);
    return false;
  }
};

/**
 * Delete folder (all objects with prefix) from file-service
 */
export const deleteFolder = async (folderPrefix: string): Promise<boolean> => {
  try {
    const response = await fetch(`${FILE_SERVICE_URL()}/internal/files/folder`, {
      method: 'DELETE',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefix: folderPrefix })
    });

    if (!response.ok) {
      throw new Error(`Delete folder failed with status ${response.status}`);
    }

    const data = await response.json() as any;

    console.info(
      `Folder deleted successfully: ${folderPrefix} (${data.count || 0} objects)`
    );

    return true;
  } catch (error) {
    console.error(`Failed to delete folder ${folderPrefix}:`, error);
    return false;
  }
};

/**
 * Check if file exists
 */
export const fileExists = async (fileId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${FILE_SERVICE_URL()}/internal/files/${fileId}`, {
      method: 'HEAD',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
      }
    });

    return response.ok;
  } catch (error) {
    return false;
  }
};

/**
 * Get file metadata
 */
export const getFileMetadata = async (fileId: string): Promise<any> => {
  try {
    const response = await fetch(`${FILE_SERVICE_URL()}/internal/meta/${fileId}`, {
      method: 'GET',
      headers: {
        'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
      }
    });

    if (!response.ok) {
      throw new Error('File not found');
    }

    const data = await response.json() as any;

    return {
      size: data.data.size,
      lastModified: data.data.lastModified,
      etag: fileId,
      contentType: 'application/octet-stream',
      metadata: {}
    };
  } catch (error) {
    console.error(`Failed to get metadata for ${fileId}:`, error);
    throw new Error('File not found');
  }
};

/**
 * List files with optional prefix
 */
export const listFiles = async (prefix?: string, maxKeys: number = 1000) => {
  try {
    const params = new URLSearchParams();
    if (prefix) params.append('prefix', prefix);
    params.append('maxKeys', String(maxKeys));

    const response = await fetch(
      `${FILE_SERVICE_URL()}/internal/files?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-Internal-Api-Key': FILE_SERVICE_API_KEY()
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to list files');
    }

    const data = await response.json() as any;

    return data.data || [];
  } catch (error) {
    console.error('Failed to list files:', error);
    throw new Error('Failed to list files');
  }
};

/**
 * Copy file (no-op for now, not needed for local storage)
 */
export const copyFile = async (
  sourceKey: string,
  destinationKey: string
): Promise<void> => {
  console.info(`File copy requested: ${sourceKey} -> ${destinationKey} (not implemented)`);
  // Could implement if needed by downloading and re-uploading
};
