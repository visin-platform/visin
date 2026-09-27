import type { OwnerRef, Visibility } from '@visin/frontend-core';
import { ProjectCosting, ProjectTaxonomy } from './taxonomy';

export interface Project {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
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
}

export interface UpdateProjectData {
  name?: string;
  slug?: string;
  description?: string;
  visibility?: Visibility;
  editorGroupIds?: string[];
  /** null clears the taxonomy, returning the project to pure discovery */
  taxonomy?: ProjectTaxonomy | null;
  /** null clears the rates, so the project stops reporting costs */
  costing?: ProjectCosting | null;
}
