import { createFileServiceClient } from '@visin/backend-core';

const client = createFileServiceClient();

/** Server-to-server store of one file: label masks are the first bytes this service writes. */
export const { putFile, getFile, deleteFile, deleteFolder } = client;

/**
 * Signed browser-direct GET URLs for a task's images, keyed by file id — one
 * call for the frame, its sensors and its masks together.
 */
export const getDownloadUrls = async (fileIds: string[], expiresInMinutes = 60): Promise<Record<string, string>> =>
  (await client.getDownloadUrls(fileIds, expiresInMinutes)).urls;

/** Where one job's mask files live, so deleting the job is a single folder delete. */
export const jobFolder = (jobId: string): string => `label/${jobId}/`;
