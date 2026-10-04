import type { OwnerRef, Visibility } from '@visin/frontend-core';
import { ProjectCosting, ProjectTaxonomy } from './taxonomy';
import type { StorageProvider } from './providers';

/**
 * Where a project keeps its big files. `visin`: on this deployment only; another store lets runs point at it. `settings`
 * is what that store keeps about the project (a Hub project's default namespace), named by its `storageProviders` entry.
 */
export interface ProjectStorage {
  provider: StorageProvider;
  settings?: Record<string, string>;
}

export interface Project {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  /** Markdown; present when the project is opened, not in lists. */
  readme?: string;
  visibility: Visibility;
  owner: OwnerRef & { name?: string };
  createdBy: string;
  trashedAt?: string;
  permissions: { read: boolean; contribute: boolean; manage: boolean; own: boolean };
  editorGroupIds?: string[];
  /** how this project's conditions, classes and metrics should read; see types/taxonomy */
  taxonomy?: ProjectTaxonomy;
  /** hourly rates for this project's hardware; absent means costs are not shown */
  costing?: ProjectCosting;
  /** absent means `visin` */
  storage?: ProjectStorage;
  stallAfterMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectData {
  owner?: OwnerRef;
  name: string;
  description?: string;
  visibility?: Visibility;
  editorGroupIds?: string[];
  taxonomy?: ProjectTaxonomy;
  costing?: ProjectCosting;
  stallAfterMinutes?: number;
}

export interface UpdateProjectData {
  name?: string;
  slug?: string;
  description?: string;
  /** Markdown, at most 20,000 characters; an empty one clears it */
  readme?: string;
  visibility?: Visibility;
  editorGroupIds?: string[];
  /** null clears the taxonomy, returning the project to pure discovery */
  taxonomy?: ProjectTaxonomy | null;
  /** null clears the rates, so the project stops reporting costs */
  costing?: ProjectCosting | null;
  /** replaces the whole setting: leave `settings` out to clear it */
  storage?: ProjectStorage;
  stallAfterMinutes?: number;
}
