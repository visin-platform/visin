import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Finding, { IFinding } from '../models/Finding';
import Training from '../models/Training';
import Project from '../models/Project';
import { checkProjectAccess } from './projectAccessService';

/**
 * Written conclusions about a project or a run.
 *
 * Access is decided entirely by the project the finding hangs off, using the
 * same `checkProjectAccess` every other project-scoped resource uses — a
 * finding about a private project must be exactly as invisible as the project
 * itself, or it becomes a side channel describing work nobody may see.
 */

/** Resolve a slug or id to the project's id, or fail the way the caller expects. */
async function resolveProjectId(identifier: string): Promise<string> {
  const bySlug = await Project.findOne({ slug: identifier });
  if (bySlug) return bySlug._id.toString();

  const byId = await Project.findById(identifier).catch(() => null);
  if (byId) return byId._id.toString();

  throw new NotFoundError('Project not found');
}

export interface ListFindingsFilters {
  project?: string;
  training?: string;
  limit?: number;
}

export const listFindings = async (
  userId: string | undefined,
  filters: ListFindingsFilters
): Promise<IFinding[]> => {
  const query: Record<string, unknown> = { deletedAt: null };

  if (filters.project) {
    const projectId = await resolveProjectId(filters.project);
    if (!(await checkProjectAccess(userId, projectId))) throw new ForbiddenError();
    query.projectId = projectId;
  }

  if (filters.training) {
    // Matches whether the run is the subject or merely cited, so a finding
    // comparing a dozen runs surfaces from any one of them.
    query.$or = [{ trainingId: filters.training }, { trainingIds: filters.training }];
  }

  const findings = await Finding.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (filters.project) return findings;

  // No project filter: the query could not be scoped up front, so every row is
  // checked before it is returned. Same rule as the rest of the service — an
  // unscoped listing must never be a way around project privacy.
  const visible: IFinding[] = [];
  for (const finding of findings) {
    if (await checkProjectAccess(userId, finding.projectId)) visible.push(finding);
  }
  return visible;
};

export const getFinding = async (id: string, userId: string | undefined): Promise<IFinding> => {
  const finding = await Finding.findOne({ _id: id, deletedAt: null });
  if (!finding) throw new NotFoundError('Finding not found');
  if (!(await checkProjectAccess(userId, finding.projectId))) throw new ForbiddenError();
  return finding;
};

export interface CreateFindingInput {
  project: string;
  training?: string;
  title: string;
  body: string;
  trainingIds?: string[];
}

export interface Author {
  kind: 'person' | 'assistant';
  label: string;
  userId: string;
}

export const createFinding = async (
  input: CreateFindingInput,
  author: Author
): Promise<IFinding> => {
  const projectId = await resolveProjectId(input.project);
  if (!(await checkProjectAccess(author.userId, projectId))) throw new ForbiddenError();

  // Writing to a project you can only read would let anyone annotate any public
  // project. Findings are the owner's record, not a comment section.
  const project = await Project.findById(projectId);
  if (project?.ownerId !== author.userId) {
    throw new ForbiddenError('Only the project owner can record findings on it');
  }

  const cited = input.trainingIds ?? (input.training ? [input.training] : []);
  if (cited.length > 0) {
    // A citation naming a run that does not exist makes the finding unverifiable
    // by exactly the reader who would want to check it.
    const found = await Training.countDocuments({ _id: { $in: cited }, deletedAt: null });
    if (found !== new Set(cited).size) {
      throw new BadRequestError('One or more cited training ids do not exist');
    }
  }

  return Finding.create({
    projectId,
    trainingId: input.training,
    title: input.title,
    body: input.body,
    trainingIds: cited,
    authorKind: author.kind,
    authorLabel: author.label,
    authorUserId: author.userId
  });
};

export const deleteFinding = async (id: string, userId: string | undefined): Promise<void> => {
  const finding = await Finding.findOne({ _id: id, deletedAt: null });
  if (!finding) throw new NotFoundError('Finding not found');

  const project = await Project.findById(finding.projectId);
  if (project?.ownerId !== userId) throw new ForbiddenError();

  // Soft, like every other delete here: a conclusion someone acted on is worth
  // being able to recover.
  finding.deletedAt = new Date();
  await finding.save();
};
