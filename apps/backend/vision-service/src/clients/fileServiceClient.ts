/**
 * File Service Client
 * All file storage goes through the local file-service API (disk-backed).
 */
import {
  logger,
  fetchWithTimeout,
  fileServiceUrl,
  fileServiceAuthHeaders,
  HttpError,
  BadGatewayError,
  NotFoundError
} from '@visin/backend-core';

export interface SignedUrlData {
  signedUrl: string;
  expiresAt: string;
  expiresInMinutes: number;
}

export interface FileMetadata {
  size: number;
  lastModified: string;
  etag: string;
  contentType: string;
  metadata: Record<string, unknown>;
}

interface DownloadUrlResponse {
  success: boolean;
  data?: { downloadUrl: string; expiresMs: number };
}

interface UploadUrlResponse {
  success: boolean;
  data?: { uploadUrl: string };
}

interface FileMetadataResponse {
  data: { size: number; lastModified: string };
}

/**
 * Get signed download URL from file-service
 */
export const getSignedUrl = async (
  fileId: string,
  expiresInMinutes: number = 60
): Promise<SignedUrlData | null> => {
  try {
    const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/download-url`, {
      method: 'POST',
      headers: {
        ...fileServiceAuthHeaders(),
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
 * Generate signed URL for file upload (direct client upload)
 */
export const getUploadSignedUrl = async (
  fileId: string,
  mimetype: string,
  expiresInMinutes: number = 15
): Promise<string> => {
  try {
    const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/upload-url`, {
      method: 'POST',
      headers: {
        ...fileServiceAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileId, expiresInMinutes, mimetype }),
      serviceName: 'file-service'
    });

    if (!response.ok) {
      throw new BadGatewayError(`Failed to generate upload URL: file-service answered ${response.status}`);
    }

    const data = await response.json() as UploadUrlResponse;

    if (!data.success || !data.data) {
      throw new BadGatewayError('Failed to generate upload URL: invalid response from file-service');
    }

    logger.info('Generated upload URL', { fileId, expiresIn: expiresInMinutes, mimetype });

    return data.data.uploadUrl;
  } catch (error) {
    logger.error('Failed to generate upload URL', { fileId, error: (error as Error).message });
    // A timeout stays a 504 and the cases above stay 502; anything else (a
    // refused connection, unparseable JSON) is still file-service's failure.
    if (error instanceof HttpError) throw error;
    throw new BadGatewayError('Failed to generate upload URL');
  }
};

/**
 * Delete file from file-service
 */
export const deleteFile = async (fileId: string): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        ...fileServiceAuthHeaders()
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
 * Get file metadata
 */
export const getFileMetadata = async (fileId: string): Promise<FileMetadata> => {
  try {
    const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/meta/${fileId}`, {
      method: 'GET',
      headers: {
        ...fileServiceAuthHeaders()
      },
      serviceName: 'file-service'
    });

    if (response.status === 404) {
      throw new NotFoundError('File not found');
    }
    if (!response.ok) {
      throw new BadGatewayError(`File metadata lookup failed: file-service answered ${response.status}`);
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
    if (error instanceof HttpError) throw error;
    throw new BadGatewayError('File metadata lookup failed');
  }
};

