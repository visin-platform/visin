import { Response } from 'express';
import * as projectService from '../services/projectService';
import { AuthRequest } from '../middleware/authMiddleware';
import type { GetProjectsQuery } from '../validation/projectSchemas';

// Get projects (public + private for logged in user)
export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  const filters = req.query as unknown as GetProjectsQuery;

  const projects = await projectService.listProjects(req.user?.id, filters);

  res.json({
    success: true,
    data: projects
  });
};

// Get project by slug
export const getProjectBySlug = async (req: AuthRequest, res: Response): Promise<void> => {
  const { slug } = req.params as { slug: string };

  const project = await projectService.getProjectBySlug(slug, req.user?.id);

  res.json({
    success: true,
    data: project
  });
};

// Get project by ID
export const getProjectById = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const project = await projectService.getProjectById(id, req.user?.id);

  res.json({
    success: true,
    data: project
  });
};

// Get project by ID or slug
export const getProjectByIdOrSlug = async (req: AuthRequest, res: Response): Promise<void> => {
  const { identifier } = req.params as { identifier: string };

  const project = await projectService.getProjectByIdOrSlug(identifier, req.user?.id);

  res.json({
    success: true,
    data: project
  });
};

// Create project
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { name, description, isPublic } = req.body;

  const savedProject = await projectService.createProject(userId, { name, description, isPublic });

  res.status(201).json({
    success: true,
    message: 'Project created successfully',
    data: savedProject
  });
};

// Update project
export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const userId = req.user!.id;
  const { name, description, isPublic, slug } = req.body;

  const updatedProject = await projectService.updateProject(id, userId, { name, description, isPublic, slug });

  res.json({
    success: true,
    message: 'Project updated successfully',
    data: updatedProject
  });
};

// Delete project
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const userId = req.user!.id;

  await projectService.deleteProject(id, userId);

  res.json({
    success: true,
    message: 'Project deleted successfully'
  });
};

// Get project dashboard stats (aggregated stats for overview)
export const getProjectDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const stats = await projectService.getProjectDashboardStats(id, req.user?.id);

  res.json({
    success: true,
    data: stats
  });
};
