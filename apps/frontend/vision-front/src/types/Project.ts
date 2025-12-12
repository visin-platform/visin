export interface Project {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface UpdateProjectData {
  name?: string;
  slug?: string;
  description?: string;
  isPublic?: boolean;
}
