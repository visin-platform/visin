import * as Minio from 'minio';
import * as https from 'https';

// MinIO client configuration for vision service - lazy loaded
let minioClient: Minio.Client | null = null;

function getMinioClient(): Minio.Client {
  if (!minioClient) {
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const options: Minio.ClientOptions = {
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || ''
    };

    if (useSSL) {
      // Allow self-signed certificates
      options.transportAgent = new https.Agent({
        rejectUnauthorized: false
      });
    }

    minioClient = new Minio.Client(options);
  }
  return minioClient;
}

// Single bucket for all vision dataset images
const BUCKET_NAME = 'vision';

/**
 * Get bucket name (always returns the single album bucket)
 */
const getBucketName = (): string => BUCKET_NAME;

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
export const generateFileId = (userId: string | undefined, albumId: string, originalFilename: string, groupId?: string): string => {
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
export const generateThumbnailFileId = (userId: string | undefined, albumId: string, originalFilename: string, groupId?: string): string => {
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
 * Upload file directly to MinIO using service account
 */
export const uploadFile = async (
  fileBuffer: Buffer,
  fileId: string,
  mimetype: string,
  size: number
): Promise<FileUploadResult> => {
  const bucketName = getBucketName();

  try {
    // Ensure bucket exists
    const bucketExists = await getMinioClient().bucketExists(bucketName);
    if (!bucketExists) {
      await getMinioClient().makeBucket(bucketName, 'us-east-1');
      console.info(`Created bucket: ${bucketName}`);
    }

    // Upload file
    const uploadResult = await getMinioClient().putObject(
      bucketName,
      fileId,
      fileBuffer,
      size,
      {
        'Content-Type': mimetype,
        'x-amz-meta-uploaded-by': 'vision-service',
        'x-amz-meta-uploaded-at': new Date().toISOString()
      }
    );

    console.info(`File uploaded successfully: ${fileId}`, {
      bucket: bucketName,
      size,
      etag: uploadResult.etag
    });

    return {
      fileId,
      bucket: bucketName,
      key: fileId,
      size,
      etag: uploadResult.etag
    };
  } catch (error) {
    console.error('Failed to upload file to MinIO:', error);
    throw new Error('File upload failed');
  }
};

/**
 * Get signed URL for photo file, preferring minioFileId over legacy fields
 */
export const getPhotoSignedUrl = async (
  photo: { minioFileId?: string; minioThumbnailFileId?: string },
  isThumbnail: boolean = false,
  expiresInMinutes: number = 60
): Promise<SignedUrlData | null> => {
  // Use minioFileId and minioThumbnailFileId (legacy approach)
  const fileIdToUse = isThumbnail ? photo.minioThumbnailFileId : photo.minioFileId;
  if (!fileIdToUse) return null;
  return await getSignedUrl(fileIdToUse, expiresInMinutes);
};
export const getSignedUrl = async (
  fileId: string,
  expiresInMinutes: number = 60
): Promise<SignedUrlData | null> => {
  const bucketName = getBucketName();

  console.info(`Generating signed URL for ${fileId} in bucket ${bucketName}`);

  try {
    const expiresInSeconds = expiresInMinutes * 60;
    const signedUrl = await getMinioClient().presignedGetObject(
      bucketName,
      fileId,
      expiresInSeconds
    );

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return {
      signedUrl,
      expiresAt: expiresAt.toISOString(),
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
  const bucketName = getBucketName();

  console.info(`Generating upload URL for ${fileId} in bucket ${bucketName}`);

  try {
    // Check if bucket exists first
    const bucketExists = await getMinioClient().bucketExists(bucketName);
    console.info(`Bucket ${bucketName} exists: ${bucketExists}`);

    if (!bucketExists) {
      console.info(`Creating bucket: ${bucketName}`);
      await getMinioClient().makeBucket(bucketName, 'us-east-1');
      console.info(`Created bucket: ${bucketName}`);
    }

    const expiresInSeconds = expiresInMinutes * 60;
    const signedUrl = await getMinioClient().presignedPutObject(
      bucketName,
      fileId,
      expiresInSeconds
    );

    console.info(`Generated upload URL for ${fileId}`, {
      bucket: bucketName,
      expiresIn: expiresInMinutes,
      mimetype
    });

    return signedUrl;
  } catch (error) {
    console.error(`Failed to generate upload URL for ${fileId}:`, error);
    throw new Error('Failed to generate upload URL');
  }
};

/**
 * Delete file from MinIO
 */
export const deleteFile = async (fileId: string): Promise<boolean> => {
  const bucketName = getBucketName();

  try {
    await getMinioClient().removeObject(bucketName, fileId);
    console.info(`File deleted successfully: ${fileId}`, { bucket: bucketName });
    return true;
  } catch (error) {
    console.error(`Failed to delete file ${fileId}:`, error);
    return false;
  }
};

/**
 * Delete folder (all objects with prefix) from MinIO
 */
export const deleteFolder = async (folderPrefix: string): Promise<boolean> => {
  const bucketName = getBucketName();

  try {
    // List all objects with the folder prefix
    const objectsList = await listFiles(folderPrefix, 1000) as any[];
    
    if (objectsList && objectsList.length > 0) {
      // Delete all objects in the folder
      const objectsToDelete = objectsList.map((obj: any) => obj.name);
      await getMinioClient().removeObjects(bucketName, objectsToDelete);
      console.info(`Folder deleted successfully: ${folderPrefix} (${objectsToDelete.length} objects)`, { bucket: bucketName });
    } else {
      console.info(`Folder not found or empty: ${folderPrefix}`, { bucket: bucketName });
    }
    
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
  const bucketName = getBucketName();

  try {
    await getMinioClient().statObject(bucketName, fileId);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get file metadata
 */
export const getFileMetadata = async (fileId: string): Promise<any> => {
  const bucketName = getBucketName();

  try {
    const stat = await getMinioClient().statObject(bucketName, fileId);
    return {
      size: stat.size,
      lastModified: stat.lastModified,
      etag: stat.etag,
      contentType: stat.metaData['content-type'],
      metadata: stat.metaData
    };
  } catch (error) {
    console.error(`Failed to get metadata for ${fileId}:`, error);
    throw new Error('File not found');
  }
};

/**
 * List files with optional prefix (for user-specific files)
 */
export const listFiles = async (prefix?: string, maxKeys: number = 1000) => {
  const bucketName = getBucketName();

  try {
    const stream = getMinioClient().listObjectsV2(bucketName, prefix, true);
    const files: any[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        files.push(obj);
        if (files.length >= maxKeys) {
          stream.destroy();
          resolve(files);
        }
      });

      stream.on('end', () => resolve(files));
      stream.on('error', reject);
    });
  } catch (error) {
    console.error('Failed to list files:', error);
    throw new Error('Failed to list files');
  }
};

/**
 * Copy file within bucket (for backup or versioning)
 */
export const copyFile = async (
  sourceKey: string,
  destinationKey: string
): Promise<void> => {
  const bucketName = getBucketName();

  try {
    await getMinioClient().copyObject(
      bucketName,
      destinationKey,
      `/${bucketName}/${sourceKey}`
    );
    console.info(`File copied: ${sourceKey} -> ${destinationKey}`, { bucket: bucketName });
  } catch (error) {
    console.error(`Failed to copy file ${sourceKey}:`, error);
    throw new Error('File copy failed');
  }
};

/**
 * Download file content from MinIO as Buffer
 */
export const getFile = async (fileId: string): Promise<Buffer> => {
  const bucketName = getBucketName();

  try {
    const stream = await getMinioClient().getObject(bucketName, fileId);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.info(`File downloaded successfully: ${fileId}`, {
          bucket: bucketName,
          size: buffer.length
        });
        resolve(buffer);
      });

      stream.on('error', (error: any) => {
        console.error(`Failed to download file ${fileId}:`, error);
        reject(new Error('File download failed'));
      });
    });
  } catch (error) {
    console.error(`Failed to download file ${fileId}:`, error);
    throw new Error('File download failed');
  }
};