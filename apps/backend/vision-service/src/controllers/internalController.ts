import type { Request, Response } from 'express';
import { NotFoundError } from '@visin/backend-core';
import Project from '../models/Project';
import { canEditProject, resolveProject } from '../services/projectAccessService';

/**
 * For auth-service, about to issue an API key limited to this project: may the
 * user write here, and what is the project called (the key keeps the name, so
 * listing keys needs no call back to this service).
 *
 * Judged as a request from that user would be, editor groups included. Group
 * membership is read through the request's identity context, which reads the
 * acting user from `req.user`, so the user is set there first; the route is
 * reachable only with the internal service token.
 */
export const getKeyAccess = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.query as { userId: string };
  const project = await resolveProject(req.params.id as string);
  if (!project) throw new NotFoundError('Project not found');
  req.user = { id: userId };
  res.json({
    success: true,
    data: { id: project._id.toString(), name: project.name, canWrite: await canEditProject(project, userId) }
  });
};

/**
 * For group-service, before it deletes a group for good: the projects the group
 * still owns, trashed ones included, since nobody could restore those after.
 */
export const getOwnedByGroup = async (req: Request, res: Response): Promise<void> => {
  const projects = await Project.find({ 'owner.kind': 'group', 'owner.id': req.params.groupId as string }).select('name').limit(1000);
  res.json({ success: true, data: { count: projects.length, names: projects.slice(0, 5).map(project => project.name) } });
};
