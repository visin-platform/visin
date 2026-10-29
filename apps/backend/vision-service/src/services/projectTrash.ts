import { atLeast, ConflictError, ForbiddenError, logger, NotFoundError, type Permission } from '@visin/backend-core';
import Project, { IProject } from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import { restoreRunEvaluations, trashRunEvaluations } from './runEvaluations';
import { requireUserCredential } from '../middleware/projectTokenContext';
import { projectFilter, projectPermission } from './projectAccessService';
import { purgeProject, TRASH_DAYS } from './purgeService';
import { invalidatePublic } from './publicCache';
import { clearPublications } from './publications';
import { ProjectView, toProjectView, requireProject, recordEvent } from './projectSupport';

/**
 * Move the project to the trash, with its live trainings, epochs and test
 * results, all stamped with the same time. Restoring it brings back exactly
 * those; a training trashed on its own beforehand stays in the trash.
 */
export const trashProject = async (id: string, userId: string): Promise<void> => {
  requireUserCredential();
  const project = await requireProject(id, userId, 'manage');
  const now = new Date();
  const marked = await Project.updateOne({ _id: project._id, trashedAt: null }, { $set: { trashedAt: now } });
  if (marked.matchedCount === 0) throw new ConflictError('The project is already in the trash');
  const projectId = project._id.toString();
  const trainingIds = (await Training.find({ projectId, deletedAt: null }).select('_id')).map(training => training._id.toString());
  await Training.updateMany({ _id: { $in: trainingIds }, deletedAt: null }, { $set: { deletedAt: now } });
  await Epoch.updateMany({ trainingId: { $in: trainingIds }, deletedAt: null }, { $set: { deletedAt: now } });
  await trashRunEvaluations({ trainingIds }, now);
  await clearPublications({ projectId }, 'project trashed');
  invalidatePublic();
  recordEvent(project, userId, 'trash');
  logger.info('Project moved to the trash', { projectId, trainings: trainingIds.length });
};

/** A trashed project, when the caller may do at least `min` with it. */
const trashedProject = async (id: string, userId: string, min: Permission): Promise<IProject> => {
  const project = /^[0-9a-fA-F]{24}$/.test(id) ? await Project.findOne({ _id: id, trashedAt: { $ne: null } }) : null;
  if (!project) throw new NotFoundError('No such project in the trash');
  if (!atLeast(await projectPermission(project, userId, { trashed: true }), min)) {
    throw new ForbiddenError("Only the project's owner, or the owning group's owner, can do this");
  }
  return project;
};

/** Projects in the trash the caller manages, most recently trashed first. */
export const listTrashedProjects = async (userId: string): Promise<(ProjectView & { purgeAt: Date })[]> => {
  requireUserCredential();
  const projects = await Project.find(await projectFilter(userId, 'manage', { trashed: true })).sort({ trashedAt: -1 });
  return Promise.all(
    projects.map(async project => ({
      ...(await toProjectView(project, userId)),
      purgeAt: new Date(project.trashedAt!.getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000)
    }))
  );
};

export const restoreProject = async (id: string, userId: string): Promise<ProjectView> => {
  requireUserCredential();
  const project = await trashedProject(id, userId, 'own');
  const trashedAt = project.trashedAt!;
  const projectId = project._id.toString();
  const trainingIds = (await Training.find({ projectId, deletedAt: trashedAt }).select('_id')).map(training => training._id.toString());
  await restoreRunEvaluations({ trainingIds }, trashedAt);
  await Epoch.updateMany({ trainingId: { $in: trainingIds }, deletedAt: trashedAt }, { $unset: { deletedAt: 1 } });
  await Training.updateMany({ _id: { $in: trainingIds }, deletedAt: trashedAt }, { $unset: { deletedAt: 1 } });
  project.trashedAt = undefined;
  await project.save();
  invalidatePublic();
  recordEvent(project, userId, 'restore');
  return toProjectView(project, userId);
};

/** Out of the trash for good, now rather than in 30 days. */
export const deleteProjectForever = async (id: string, userId: string): Promise<void> => {
  requireUserCredential();
  const project = await trashedProject(id, userId, 'own');
  await purgeProject(project);
  recordEvent(project, userId, 'purge');
  logger.info('Project deleted for good', { projectId: id });
};
