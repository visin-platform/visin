import type { QueryFilter, Types } from 'mongoose';
import Project, { type IProject } from '../models/Project';
import Training from '../models/Training';
import { Finding } from '../models/Finding';
import { publicProjectsAmong, type ActivityProject } from './activityService';
import { lookupOwnerIdentities } from '../clients/ownerIdentityClient';
import type { PublicFindingsQuery, PublicProjectsQuery } from '../validation/exploreSchemas';

/** A public project as a card shows it. Never who else took part, and nothing that needs a sign-in. */
export interface PublicProjectCard {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  /** Who owns it, as far as they agreed to be shown: a bare `kind` and `id` when they did not. */
  owner: { kind: 'user' | 'group'; id: string; name?: string; handle?: string; picture?: string };
  createdAt: string;
  updatedAt: string;
  /** When anything last happened in it: a run, an epoch, a finding, a result, a change of settings. */
  lastActivityAt: string;
  /** Runs in it, and when the latest started. */
  runs: number;
  lastRunAt?: string;
}

/**
 * The public projects, paged: the same for everyone who asks, so a signed-in member's own private projects never
 * mix into what Explore shows, and nothing is filtered after the page was cut.
 *
 * The owners are asked for in one call per kind, and the run counts in one grouped query for the page, so a page
 * costs three reads however many cards it has.
 */
export async function listPublicProjects({ search, sort, page, limit }: PublicProjectsQuery) {
  const filter: QueryFilter<IProject> = { visibility: 'public', trashedAt: null, ...(search ? { $text: { $search: search } } : {}) };
  const skip = (page - 1) * limit;

  // `updated` is the latest activity, which a project older than that field reads as its last edit.
  const [order, total] = await Promise.all([
    sort === 'created'
      ? Project.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).select('_id')
      : Project.aggregate<{ _id: Types.ObjectId }>([
          { $match: filter },
          { $addFields: { activityAt: { $ifNull: ['$lastActivityAt', '$updatedAt'] } } },
          { $sort: { activityAt: -1, _id: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 1 } }
        ]),
    Project.countDocuments(filter)
  ]);
  const found = await Project.find({ _id: { $in: order.map((row) => row._id) } });
  const byId = new Map(found.map((project) => [String(project._id), project]));
  const projects = order.flatMap((row) => byId.get(String(row._id)) ?? []);

  const ids = projects.map((project) => String(project._id));
  const [owners, runs] = await Promise.all([
    lookupOwnerIdentities(projects.map((project) => project.owner)),
    Training.aggregate<{ _id: string; runs: number; lastRunAt: Date }>([
      { $match: { projectId: { $in: ids }, deletedAt: null } },
      { $group: { _id: '$projectId', runs: { $sum: 1 }, lastRunAt: { $max: '$createdAt' } } }
    ])
  ]);
  const runsByProject = new Map(runs.map((row) => [row._id, row]));

  const cards: PublicProjectCard[] = projects.map((project) => {
    const { id: _id, ...shown } = owners.get(project.owner.id) ?? { id: '' };
    const counted = runsByProject.get(String(project._id));
    return {
      id: String(project._id),
      name: project.name,
      ...(project.slug ? { slug: project.slug } : {}),
      ...(project.description ? { description: project.description } : {}),
      owner: { kind: project.owner.kind, id: project.owner.id, ...shown },
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      lastActivityAt: (project.lastActivityAt ?? project.updatedAt).toISOString(),
      runs: counted?.runs ?? 0,
      ...(counted ? { lastRunAt: counted.lastRunAt.toISOString() } : {})
    };
  });

  return { projects: cards, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/** A written conclusion in a public project, as Explore lists it: what it says it is, and where it lives. */
export interface PublicFindingRow {
  id: string;
  title: string;
  authorKind: 'person' | 'assistant';
  authorLabel: string;
  createdAt: string;
  project: ActivityProject;
  /** The run it is about, where it is about one. */
  trainingId?: string;
}

/** Rows read per row returned, since findings of private projects are skipped by reading past them. */
const READ_AHEAD = 4;

/**
 * The latest findings in public projects, newest first, the same for everyone. A member's findings in their own
 * private projects are not here, so Explore reads the same signed in or out. Only what a card needs: never the body,
 * and never which account wrote it.
 */
export async function listPublicFindings({ limit }: PublicFindingsQuery): Promise<PublicFindingRow[]> {
  const recent = await Finding.find({ deletedAt: null })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit * READ_AHEAD);
  const projects = await publicProjectsAmong(recent.map((finding) => finding.projectId));
  return recent
    .filter((finding) => projects.has(finding.projectId))
    .slice(0, limit)
    .map((finding) => ({
      id: String(finding._id),
      title: finding.title,
      authorKind: finding.authorKind,
      authorLabel: finding.authorLabel,
      createdAt: finding.createdAt.toISOString(),
      project: projects.get(finding.projectId)!,
      ...(finding.trainingId ? { trainingId: finding.trainingId } : {})
    }));
}
