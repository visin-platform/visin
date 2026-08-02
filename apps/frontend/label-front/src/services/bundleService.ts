import { labelApi } from './labelApiClient';
import {
  ApiResponse,
  BundleUpload,
  ImportJob,
  ImportMapping,
  LabelBundle,
  MaskField,
  ZipPreview
} from '../types';

export const listBundles = async (): Promise<LabelBundle[]> =>
  (await labelApi.get<ApiResponse<LabelBundle[]>>('/bundles')).data;

export const getBundle = async (bundleId: string): Promise<LabelBundle> =>
  (await labelApi.get<ApiResponse<LabelBundle>>(`/bundles/${bundleId}`)).data;

export const getMaskFields = async (bundleId: string, set: string): Promise<MaskField[]> =>
  (
    await labelApi.get<ApiResponse<MaskField[]>>(
      `/bundles/${bundleId}/mask-fields?set=${encodeURIComponent(set)}`
    )
  ).data;

export const createBundle = async (input: {
  name: string;
  groupId: string;
  description?: string;
}): Promise<LabelBundle> => (await labelApi.post<ApiResponse<LabelBundle>>('/bundles', input)).data;

/** Metadata only — a bundle's images are immutable once imported. */
export const updateBundle = async (
  bundleId: string,
  input: { name?: string; description?: string }
): Promise<LabelBundle> => (await labelApi.patch<ApiResponse<LabelBundle>>(`/bundles/${bundleId}`, input)).data;

export const deleteBundle = async (bundleId: string): Promise<void> => {
  await labelApi.delete(`/bundles/${bundleId}`);
};

export const getUploadUrl = async (
  bundleId: string
): Promise<{ uploadUrl: string; zipFileId: string; expiresMs: number }> =>
  (await labelApi.post<ApiResponse<{ uploadUrl: string; zipFileId: string; expiresMs: number }>>(
    `/bundles/${bundleId}/upload-url`
  )).data;

/** Zips already uploaded for this bundle, newest first. */
export const listUploads = async (bundleId: string): Promise<BundleUpload[]> =>
  (await labelApi.get<ApiResponse<BundleUpload[]>>(`/bundles/${bundleId}/uploads`)).data;

/** Zip shape + suggested mapping — the input to the mapping step. */
export const previewImport = async (bundleId: string, zipFileId: string): Promise<ZipPreview> =>
  (await labelApi.post<ApiResponse<ZipPreview>>(`/bundles/${bundleId}/import/preview`, { zipFileId })).data;

export const startImport = async (
  bundleId: string,
  zipFileId: string,
  mapping?: ImportMapping
): Promise<ImportJob> =>
  (await labelApi.post<ApiResponse<ImportJob>>(`/bundles/${bundleId}/import`, {
    zipFileId,
    ...(mapping ? { mapping } : {})
  })).data;

export const getImport = async (bundleId: string, importId: string): Promise<ImportJob> =>
  (await labelApi.get<ApiResponse<ImportJob>>(`/bundles/${bundleId}/import/${importId}`)).data;

/**
 * PUT the zip straight to file-service via the signed URL. XMLHttpRequest, not
 * fetch: multi-GB uploads need upload.onprogress, which fetch doesn't expose.
 */
export const uploadZip = (uploadUrl: string, file: File, onProgress: (fraction: number) => void): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Zip upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Zip upload failed (network)'));
    xhr.onabort = () => reject(new Error('Zip upload cancelled'));
    xhr.send(file);
  });
