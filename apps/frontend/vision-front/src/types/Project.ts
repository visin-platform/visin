import { ProjectCosting, ProjectTaxonomy } from './taxonomy';

export interface Project {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  isPublic: boolean;
  ownerId: string;
  /** how this project's conditions, classes and metrics should read; see types/taxonomy */
  taxonomy?: ProjectTaxonomy;
  /** hourly rates for this project's hardware; absent means costs are not shown */
  costing?: ProjectCosting;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  isPublic?: boolean;
  taxonomy?: ProjectTaxonomy;
  costing?: ProjectCosting;
}

export interface UpdateProjectData {
  name?: string;
  slug?: string;
  description?: string;
  isPublic?: boolean;
  /** null clears the taxonomy, returning the project to pure discovery */
  taxonomy?: ProjectTaxonomy | null;
  /** null clears the rates, so the project stops reporting costs */
  costing?: ProjectCosting | null;
}
