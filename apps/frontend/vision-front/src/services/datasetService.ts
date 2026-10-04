import type { OwnerRef, Visibility } from '@visin/frontend-core';
import { datasetApi } from '../config/datasetApi';
import type { HubDatasetSource } from '../providers/huggingFace';
import { uploadToSignedUrl } from '../utils/chunkedUpload';

export type DatasetVisibility = Visibility;

/** What the caller may do with a dataset, as dataset-service decides it. */
export interface DatasetPermissions {
  read: boolean;
  /** upload a zip, import images */
  contribute: boolean;
  /** rename, set the cover, remove image groups, move to the trash, run label jobs */
  manage: boolean;
  /** make it public, transfer it, restore it or delete it for good */
  own: boolean;
}
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

/** What the Hub says about a dataset's repo at its pinned commit. */
export interface HubDatasetInfo {
  repo: string;
  revision: string;
  license?: string;
  prettyName?: string;
  tags: string[];
  taskCategories?: string[];
  languages?: string[];
  sizeCategories?: string[];
  gated?: boolean;
  fileCount: number;
  totalBytes: number;
  /** top-level folders, which is where a dataset's splits usually are */
  folders: { path: string; files: number; bytes: number }[];
  files: { path: string; size?: number }[];
  truncated: boolean;
}

/** A dataset kept on a store: Visin stores only this pointer. */
export type DatasetSource = HubDatasetSource;

export interface Dataset {
  _id: string;
  name: string;
  description?: string;
  /** `name` is the owning group's, when the caller is in it */
  owner: OwnerRef & { name?: string };
  createdBy: string;
  visibility: DatasetVisibility;
  /** set while it is in the trash */
  trashedAt?: string;
  /** set when the dataset lives on the Hub; the zip, if any, is the local copy */
  source?: DatasetSource;
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
  permissions: DatasetPermissions;
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

/** `owner`: `me`, or a group id — only that owner's datasets. */
export const listDatasets = async (params: { search?: string; page?: number; limit?: number; owner?: string } = {}) =>
  (await datasetApi.get<Envelope<{ datasets: Dataset[]; pagination: Pagination }>>(query(params))).data;

export const getDataset = async (id: string) => (await datasetApi.get<Envelope<Dataset>>(`/${id}`)).data;

export const listMyGroups = async () => (await datasetApi.get<Envelope<DatasetGroupOption[]>>('/groups')).data;

export interface DatasetFields {
  name: string;
  description?: string;
  visibility: DatasetVisibility;
  /** who it belongs to at creation; afterwards it moves by transfer */
  owner?: OwnerRef;
  /** null goes back to the zip kept on Visin */
  source?: DatasetSource | null;
}

export const createDataset = async (fields: DatasetFields) => (await datasetApi.post<Envelope<Dataset>>('', fields)).data;

export const updateDataset = async (id: string, fields: Partial<DatasetFields>) =>
  (await datasetApi.patch<Envelope<Dataset>>(`/${id}`, fields)).data;

/** Into the trash, where its owner can restore it for 30 days. */
export const trashDataset = async (id: string): Promise<void> => {
  await datasetApi.delete(`/${id}`);
};

/** Trashed datasets the caller manages, most recently trashed first. */
export const listTrash = async () => (await datasetApi.get<Envelope<Dataset[]>>('/trash')).data;

export const restoreDataset = async (id: string) => (await datasetApi.post<Envelope<Dataset>>(`/${id}/restore`)).data;

/** Out of the trash for good: its files are deleted. */
export const deleteDatasetForever = async (id: string): Promise<void> => {
  await datasetApi.delete(`/${id}/permanent`);
};

/** Hand it, with its label jobs, to another owner. */
export const transferDataset = async (id: string, owner: OwnerRef) =>
  (await datasetApi.put<Envelope<Dataset>>(`/${id}/owner`, { owner })).data;

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
export const uploadArchive = async (id: string, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal) => {
  const { data } = await datasetApi.post<Envelope<{ uploadUrl?: string; uploaded: boolean }>>(`/${id}/archive/upload-url`, {
    filename: file.name,
    size: file.size,
    lastModified: file.lastModified
  });
  if (!data.uploaded && data.uploadUrl) {
    await uploadToSignedUrl(data.uploadUrl, file, onProgress, signal);
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

/** Read from the Hub itself, for public repos only; a private or missing repo is a 404. */
export const getHubInfo = async (id: string) => (await datasetApi.get<Envelope<HubDatasetInfo>>(`/${id}/hub`)).data;

export const getDownloadUrl = async (id: string) =>
  (await datasetApi.get<Envelope<{ downloadUrl: string; filename: string }>>(`/${id}/download`)).data;

export const startImport = async (id: string, mapping: ImportMapping) =>
  (await datasetApi.post<Envelope<Dataset>>(`/${id}/import`, mapping)).data;

/** Carry on with a cancelled or failed import; files it already stored are skipped. */
export const resumeImport = async (id: string) => (await datasetApi.post<Envelope<Dataset>>(`/${id}/import/resume`)).data;

export const cancelImport = async (id: string) => (await datasetApi.delete<Envelope<Dataset>>(`/${id}/import`)).data;

export const listItems = async (
  id: string,
  params: { group?: string; kind?: 'image' | 'json'; stem?: string; search?: string; page?: number; limit?: number }
) => (await datasetApi.get<Envelope<{ items: DatasetItem[]; pagination: Pagination }>>(`/${id}/items${query(params)}`)).data;
