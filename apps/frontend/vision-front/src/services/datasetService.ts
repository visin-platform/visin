import { datasetApi } from '../config/datasetApi';
import { uploadToSignedUrl } from '../utils/chunkedUpload';

export type DatasetVisibility = 'public' | 'group';
export type ImportStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type ScanStatus = 'queued' | 'running' | 'done' | 'failed';

export interface FolderMapping {
  folder: string;
  group: string;
}

export interface ImportMapping {
  groups: FolderMapping[];
  manifest?: string;
}

export interface ContentsFolder {
  path: string;
  depth: number;
  files: number;
  images: number;
  jsons: number;
  bytes: number;
}

export interface DatasetContents {
  entries: number;
  totalBytes: number;
  truncated: boolean;
  folders: ContentsFolder[];
  extensions: { ext: string; files: number; bytes: number }[];
}

export interface DatasetImport {
  id: string;
  status: ImportStatus;
  mapping: ImportMapping;
  processed: number;
  skipped: number;
  total?: number;
  /** files the mapping takes, per the zip's index */
  expected?: number;
  /** bytes of the zip copied to the server's work disk; extraction starts after all of it */
  copiedBytes?: number;
  errors: { path: string; reason: string }[];
  startedAt?: string;
  finishedAt?: string;
  /** the zip was replaced after this import ran */
  stale: boolean;
}

export interface Dataset {
  _id: string;
  name: string;
  description?: string;
  ownerId: string;
  visibility: DatasetVisibility;
  groupId?: string;
  /** `size` is absent until the zip has been scanned (a dataset migrated from labeling starts that way) */
  archive?: { filename: string; size?: number; uploadedAt: string };
  /** an upload that stopped before it finished: choosing the same file again resumes it */
  uploading?: { filename: string; size?: number };
  contents?: DatasetContents;
  /** reading the zip's index, which happens in the background after an upload */
  scan?: { status: ScanStatus; error?: string; finishedAt?: string };
  groups: { name: string; images: number; jsons: number }[];
  imageCount: number;
  coverUrl?: string;
  /** image groups being removed in the background; already left out of `groups` and `imageCount` */
  removingGroups: string[];
  /** the image a user picked as the cover; absent when the cover is chosen automatically */
  coverPath?: string;
  import?: DatasetImport;
  /** labeling jobs whose tasks show this dataset's images */
  usedBy: number;
  canWrite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetItem {
  _id: string;
  group: string;
  path: string;
  stem: string;
  variant?: string;
  kind: 'image' | 'json';
  width?: number;
  height?: number;
  size: number;
  mimetype?: string;
  thumbnailUrl?: string;
  url?: string;
  data?: unknown;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface DatasetGroupOption {
  id: string;
  name: string;
  role: string;
}

interface Envelope<T> {
  data: T;
}

const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const listDatasets = async (params: { search?: string; page?: number; limit?: number } = {}) =>
  (await datasetApi.get<Envelope<{ datasets: Dataset[]; pagination: Pagination }>>(query(params))).data;

export const getDataset = async (id: string) => (await datasetApi.get<Envelope<Dataset>>(`/${id}`)).data;

export const listMyGroups = async () => (await datasetApi.get<Envelope<DatasetGroupOption[]>>('/groups')).data;

export interface DatasetFields {
  name: string;
  description?: string;
  visibility: DatasetVisibility;
  groupId?: string;
}

export const createDataset = async (fields: DatasetFields) => (await datasetApi.post<Envelope<Dataset>>('', fields)).data;

export const updateDataset = async (id: string, fields: Partial<DatasetFields>) =>
  (await datasetApi.patch<Envelope<Dataset>>(`/${id}`, fields)).data;

export const deleteDataset = async (id: string): Promise<void> => {
  await datasetApi.delete(`/${id}`);
};

/**
 * Tell dataset-service a zip has arrived. It swaps the archive in and queues
 * reading its index, so this returns straight away; the dataset's `scan`
 * reports that reading. Also finishes an upload whose browser went away after
 * the last byte was sent.
 */
export const finishUpload = async (id: string) => (await datasetApi.post<Envelope<Dataset>>(`/${id}/archive/complete`)).data;

/**
 * Upload a zip for a dataset: reserve, send it straight to file-service in
 * chunks, then finish. The signed URL is its own credential, so the bytes
 * never pass through dataset-service.
 *
 * Size and date identify the file: the same one again after an interrupted
 * upload gets that upload back, and file-service's first answer moves the
 * progress on to where it stopped — or, if every byte had arrived, there is
 * nothing to send.
 */
export const uploadArchive = async (id: string, file: File, onProgress?: (fraction: number) => void) => {
  const { data } = await datasetApi.post<Envelope<{ uploadUrl?: string; uploaded: boolean }>>(`/${id}/archive/upload-url`, {
    filename: file.name,
    size: file.size,
    lastModified: file.lastModified
  });
  if (!data.uploaded && data.uploadUrl) {
    await uploadToSignedUrl(data.uploadUrl, file, onProgress);
  }
  return finishUpload(id);
};

/** Take one image group out of the dataset; its files are deleted in the background. */
export const removeGroup = async (id: string, group: string) =>
  (await datasetApi.delete<Envelope<Dataset>>(`/${id}/groups/${encodeURIComponent(group)}`)).data;

/** Show this image on the dataset's card, or (null) let the import pick one again. */
export const setCover = async (id: string, itemId: string | null) =>
  (await datasetApi.put<Envelope<Dataset>>(`/${id}/cover`, { itemId })).data;

/** Give up on an interrupted upload; its partial bytes are deleted from the server. */
export const discardUpload = async (id: string) => (await datasetApi.delete<Envelope<Dataset>>(`/${id}/archive/upload`)).data;

/** Measure and index a zip that is already stored, in the background like after an upload. */
export const scanArchive = async (id: string) => (await datasetApi.post<Envelope<Dataset>>(`/${id}/archive/scan`)).data;

export const getDownloadUrl = async (id: string) =>
  (await datasetApi.get<Envelope<{ downloadUrl: string; filename: string }>>(`/${id}/download`)).data;

export const startImport = async (id: string, mapping: ImportMapping) =>
  (await datasetApi.post<Envelope<Dataset>>(`/${id}/import`, mapping)).data;

export const cancelImport = async (id: string) => (await datasetApi.delete<Envelope<Dataset>>(`/${id}/import`)).data;

export const listItems = async (
  id: string,
  params: { group?: string; kind?: 'image' | 'json'; stem?: string; search?: string; page?: number; limit?: number }
) => (await datasetApi.get<Envelope<{ items: DatasetItem[]; pagination: Pagination }>>(`/${id}/items${query(params)}`)).data;
