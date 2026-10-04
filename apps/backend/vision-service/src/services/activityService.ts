import { isValidObjectId } from 'mongoose';
import Project from '../models/Project';
import Training from '../models/Training';
import Evaluation from '../models/Evaluation';
import { Finding } from '../models/Finding';
import { readerVisible } from './evaluationScope';
import type { ActivityQuery } from '../validation/activitySchemas';

export interface ActivityProject {
  id: string;
  name: string;
  slug?: string;
}

/** One line of a public activity feed. Always about a public project, and never about who else was involved. */
export type ActivityItem =
  | { kind: 'project.created'; at: string; project: ActivityProject }
  | {
      kind: 'finding.posted';
      at: string;
      project: ActivityProject;
      finding: { id: string; title: string; authorKind: 'person' | 'assistant'; authorLabel: string };
    }
  | { kind: 'training.run'; at: string; project: ActivityProject; /** runs started that UTC day in that project */ count: number }
  | {
      kind: 'evaluation.recorded';
      at: string;
      project: ActivityProject;
      evaluation: { id: string; status: 'completed' | 'failed'; suite?: { slug: string; version: number } };
    };

/**
 * Rows read per source before they are cut down to public projects. A person's private work is skipped by reading
 * past it, so this bounds how far: more than a page of nothing but private activity ends a source early.
 */
const READ_AHEAD = 3;
/** A group's projects are read whole, to ask the other sources about them; no group has more than this in public. */
const GROUP_PROJECTS = 500;

const toProject = (project: { _id: unknown; name: string; slug?: string }): ActivityProject => ({
  id: String(project._id),
  name: project.name,
  ...(project.slug ? { slug: project.slug } : {})
});

/** Of these ids, the public projects that are not in the trash, by id. Anything that is not an id is not one. */
export async function publicProjectsAmong(ids: string[]): Promise<Map<string, ActivityProject>> {
  const valid = [...new Set(ids)].filter((id) => isValidObjectId(id));
  const found = await Project.find({ _id: { $in: valid }, visibility: 'public', trashedAt: null }).select('name slug');
  return new Map(found.map((project) => [String(project._id), toProject(project)]));
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

interface Sources {
  /** public projects the person made, or the group owns */
  projects: { _id: unknown; name: string; slug?: string; createdAt: Date }[];
  findings: { _id: unknown; projectId: string; title: string; authorKind: 'person' | 'assistant'; authorLabel: string; createdAt: Date }[];
  trainings: { projectId?: string; createdAt: Date }[];
  evaluations: { _id: unknown; projectId: string; status: 'completed' | 'failed'; suite?: { slug: string; version: number }; receivedAt: Date }[];
}

/**
 * What one person, or one group, has been doing in public, newest first: projects made, findings posted, runs
 * started (one line per project per day, not one per run) and results recorded.
 *
 * Derived on every request from what is stored, never from a log of its own, so it can neither be out of date nor
 * outlive a change of visibility: a project made private or trashed takes its whole history with it, at once.
 * Only public projects count, whoever asks, so the feed reads the same to its owner as to a stranger; and of the
 * evaluations only what a reader of a public project is shown (its runs' tests, and what a manager published).
 */
export async function listActivity({ user, owner, limit }: ActivityQuery): Promise<ActivityItem[]> {
  const window = limit * READ_AHEAD;
  const live = { deletedAt: null };
  let sources: Sources;
  let projectsById: Map<string, ActivityProject>;

  if (user) {
    const made = await Project.find({ createdBy: user, visibility: 'public', trashedAt: null })
      .sort({ createdAt: -1 })
      .limit(window)
      .select('name slug createdAt');
    const [findings, trainings, evaluations] = await Promise.all([
      Finding.find({ authorUserId: user, ...live }).sort({ createdAt: -1 }).limit(window),
      Training.find({ ownerId: user, projectId: { $exists: true }, ...live }).sort({ createdAt: -1 }).limit(window * 5).select('projectId createdAt'),
      Evaluation.find({ ownerId: user, ...live, ...readerVisible }).sort({ receivedAt: -1 }).limit(window)
    ]);
    sources = { projects: made, findings, trainings, evaluations };
    projectsById = await publicProjectsAmong([
      ...findings.map((row) => row.projectId),
      ...trainings.map((row) => row.projectId ?? ''),
      ...evaluations.map((row) => row.projectId)
    ]);
    for (const project of made) projectsById.set(String(project._id), toProject(project));
  } else {
    const owned = await Project.find({ 'owner.kind': 'group', 'owner.id': owner, visibility: 'public', trashedAt: null })
      .sort({ createdAt: -1 })
      .limit(GROUP_PROJECTS)
      .select('name slug createdAt');
    const ids = owned.map((project) => String(project._id));
    const [findings, trainings, evaluations] = await Promise.all([
      Finding.find({ projectId: { $in: ids }, ...live }).sort({ createdAt: -1 }).limit(window),
      Training.find({ projectId: { $in: ids }, ...live }).sort({ createdAt: -1 }).limit(window * 5).select('projectId createdAt'),
      Evaluation.find({ projectId: { $in: ids }, ...live, ...readerVisible }).sort({ receivedAt: -1 }).limit(window)
    ]);
    sources = { projects: owned.slice(0, window), findings, trainings, evaluations };
    projectsById = new Map(owned.map((project) => [String(project._id), toProject(project)]));
  }

  const items: ActivityItem[] = [];
  for (const project of sources.projects) {
    items.push({ kind: 'project.created', at: project.createdAt.toISOString(), project: toProject(project) });
  }
  for (const finding of sources.findings) {
    const project = projectsById.get(finding.projectId);
    if (!project) continue;
    items.push({
      kind: 'finding.posted',
      at: finding.createdAt.toISOString(),
      project,
      finding: { id: String(finding._id), title: finding.title, authorKind: finding.authorKind, authorLabel: finding.authorLabel }
    });
  }
  for (const evaluation of sources.evaluations) {
    const project = projectsById.get(evaluation.projectId);
    if (!project) continue;
    items.push({
      kind: 'evaluation.recorded',
      at: evaluation.receivedAt.toISOString(),
      project,
      evaluation: {
        id: String(evaluation._id),
        status: evaluation.status,
        ...(evaluation.suite ? { suite: { slug: evaluation.suite.slug, version: evaluation.suite.version } } : {})
      }
    });
  }

  // Runs: one line per project per UTC day, stamped with the latest start of that day.
  const runs = new Map<string, { project: ActivityProject; at: Date; count: number }>();
  for (const training of sources.trainings) {
    const project = training.projectId ? projectsById.get(training.projectId) : undefined;
    if (!project) continue;
    const key = `${project.id}:${day(training.createdAt)}`;
    const held = runs.get(key);
    if (held) {
      held.count += 1;
      if (training.createdAt > held.at) held.at = training.createdAt;
    } else {
      runs.set(key, { project, at: training.createdAt, count: 1 });
    }
  }
  for (const { project, at, count } of runs.values()) {
    items.push({ kind: 'training.run', at: at.toISOString(), project, count });
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
