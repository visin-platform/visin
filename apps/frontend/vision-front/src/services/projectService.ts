import type { OwnerGroup, OwnerRef } from '@visin/frontend-core';
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
  async getGroups(): Promise<OwnerGroup[]> {
    const response = await visionApi.get('/write-capabilities/groups');
    return (response.data as ApiResponse<OwnerGroup[]>).data;
  },

  async getTrash(): Promise<ApiResponse<Project[]>> {
    return (await visionApi.get('/projects/trash')).data as ApiResponse<Project[]>;
  },

  async restoreProject(id: string): Promise<ApiResponse<Project>> {
    return (await visionApi.post(`/projects/${id}/restore`)).data as ApiResponse<Project>;
  },

  async deleteProjectForever(id: string): Promise<ApiResponse<void>> {
    return (await visionApi.delete(`/projects/${id}/permanent`)).data as ApiResponse<void>;
  },

  async transferProject(id: string, owner: OwnerRef): Promise<ApiResponse<Project>> {
    return (await visionApi.put(`/projects/${id}/owner`, { owner })).data as ApiResponse<Project>;
  },

  // Get all projects
  async getProjects(params?: {
    search?: string;
    owner?: string;
    access?: 'contribute';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Project[]>> {
    const response = await visionApi.get('/projects', { params });
    return response.data as ApiResponse<Project[]>;
  },

  // Get project by ID
  async getProjectById(id: string): Promise<ApiResponse<Project>> {
    const response = await visionApi.get(`/projects/${id}`);
    return response.data as ApiResponse<Project>;
  },

  // Get project dashboard stats
  async getProjectDashboardStats(id: string): Promise<ApiResponse<ProjectDashboardStats>> {
    const response = await visionApi.get(`/projects/${id}/dashboard-stats`);
    return response.data as ApiResponse<ProjectDashboardStats>;
  },

  // Create project
  async createProject(projectData: CreateProjectData): Promise<ApiResponse<Project>> {
    const response = await visionApi.post('/projects', projectData);
    return response.data as ApiResponse<Project>;
  },

  // Update project
  async updateProject(id: string, projectData: UpdateProjectData): Promise<ApiResponse<Project>> {
    const response = await visionApi.put(`/projects/${id}`, projectData);
    return response.data as ApiResponse<Project>;
  },

  // Delete project
  async deleteProject(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/projects/${id}`);
    return response.data as ApiResponse<void>;
  }
};
