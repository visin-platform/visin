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

// Get project by ID or slug
export const getProjectByIdOrSlug = async (req: AuthRequest, res: Response): Promise<void> => {
  // An id or a slug.
  const { id: identifier } = req.params as { id: string };

  const project = await projectService.getProjectByIdOrSlug(identifier, req.user?.id);

  res.json({
    success: true,
    data: project
  });
};

// Create project
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { name, description, visibility, owner, taxonomy, costing, storage, stallAfterMinutes, editorGroupIds } = req.body;

  const savedProject = await projectService.createProject(userId, { name, description, visibility, owner, taxonomy, costing, storage, stallAfterMinutes, editorGroupIds });

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
  const { name, description, visibility, slug, taxonomy, costing, storage, stallAfterMinutes, editorGroupIds } = req.body;

  const updatedProject = await projectService.updateProject(id, userId, { name, description, visibility, slug, taxonomy, costing, storage, stallAfterMinutes, editorGroupIds });

  res.json({
    success: true,
    message: 'Project updated successfully',
    data: updatedProject
  });
};

// Move a project to the trash, with its trainings: restorable by its owner for 30 days
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  await projectService.trashProject(id, req.user!.id);

  res.json({
    success: true,
    message: 'Project moved to the trash'
  });
};

export const listTrashedProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await projectService.listTrashedProjects(req.user!.id) });
};

export const restoreProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  res.json({ success: true, data: await projectService.restoreProject(id, req.user!.id) });
};

export const deleteProjectForever = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  await projectService.deleteProjectForever(id, req.user!.id);
  res.json({ success: true, message: 'Project deleted' });
};

export const transferProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  res.json({ success: true, data: await projectService.transferProject(id, req.user!.id, req.body.owner) });
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
