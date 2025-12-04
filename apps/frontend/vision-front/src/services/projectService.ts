import { visionApi } from '../config/visionApi';
import { Project, CreateProjectData } from '../types/Project';
import { ApiResponse } from '../types';

export const projectService = {
  // Get all projects
  async getProjects(params?: {
    search?: string;
  }): Promise<ApiResponse<Project[]>> {
    const response = await visionApi.get('/projects', { params });
    return response.data;
  },

  // Get project by ID
  async getProjectById(id: string): Promise<ApiResponse<Project>> {
    const response = await visionApi.get(`/projects/${id}`);
    return response.data;
  },

  // Create project
  async createProject(projectData: CreateProjectData): Promise<ApiResponse<Project>> {
    const response = await visionApi.post('/projects', projectData);
    return response.data;
  },

  // Update project
  async updateProject(id: string, projectData: Partial<CreateProjectData>): Promise<ApiResponse<Project>> {
    const response = await visionApi.put(`/projects/${id}`, projectData);
    return response.data;
  },

  // Delete project
  async deleteProject(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/projects/${id}`);
    return response.data;
  }
};
