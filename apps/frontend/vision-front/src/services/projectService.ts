import { visionApi } from '../config/visionApi';
import { Project, CreateProjectData, UpdateProjectData } from '../types/Project';
import { ApiResponse } from '../types';

export interface ProjectDashboardStats {
  trainingStats: {
    totalTrainings: number;
    totalTime: number;
    totalEpochs: number;
    avgEpochTime: number;
    totalCpuCost: number;
    totalGpuCost: number;
    totalCost: number;
  };
  testResultsCount: number;
  visualizationsCount: number;
  benchmarksCount: number;
}

export const projectService = {
  // Get all projects
  async getProjects(params?: {
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Project[]>> {
    const response = await visionApi.get('/projects', { params });
    return response.data;
  },

  // Get project by ID
  async getProjectById(id: string): Promise<ApiResponse<Project>> {
    const response = await visionApi.get(`/projects/${id}`);
    return response.data;
  },

  // Get project dashboard stats
  async getProjectDashboardStats(id: string): Promise<ApiResponse<ProjectDashboardStats>> {
    const response = await visionApi.get(`/projects/${id}/dashboard-stats`);
    return response.data;
  },

  // Create project
  async createProject(projectData: CreateProjectData): Promise<ApiResponse<Project>> {
    const response = await visionApi.post('/projects', projectData);
    return response.data;
  },

  // Update project
  async updateProject(id: string, projectData: UpdateProjectData): Promise<ApiResponse<Project>> {
    const response = await visionApi.put(`/projects/${id}`, projectData);
    return response.data;
  },

  // Delete project
  async deleteProject(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/projects/${id}`);
    return response.data;
  }
};
