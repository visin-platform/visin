import { canEditProject } from './projectAccessService';
import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Finding, { IFinding } from '../models/Finding';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import Project from '../models/Project';
import { ExportOptions, ExportRun, findingToLatex } from './latexExport';
import { checkProjectAccess, createProjectAccessChecker, getVisibleProjectIds, resolveProject } from './projectAccessService';
import { tokenProjectId } from '../middleware/projectTokenContext';
import { parseFindingCursor } from './findingCursor';

/**
 * Written conclusions about a project or a run.
 *
 * Access is decided entirely by the project the finding hangs off, using the
 * same `checkProjectAccess` every other project-scoped resource uses — a
 * finding about a private project must be exactly as invisible as the project
 * itself, or it becomes a side channel describing work nobody may see.
 */

/**
 * Resolve a slug or id to the project's id, or fail the way the caller expects.
 *
 * Through `resolveProject` rather than a slug-first lookup of its own: an
 * id-shaped identifier is an id. Slugs are free text, so slug-first let any
 * owner name their project after someone else's project id — and every listing
 * for that id, including the victim's own assistant's, then read the squatter's
 * findings as the victim project's record.
 */
async function resolveProjectId(identifier: string): Promise<string> {
  const project = await resolveProject(identifier);
  if (!project) throw new NotFoundError('Project not found');
  return project._id.toString();
}

/**
 * A cited run, named.
 *
 * The reason this exists: a finding stored `trainingIds` and nothing else, so
 * the app could say "draws on 2 runs" and an assistant reading one back got a
 * pair of ObjectIds. Neither tells the reader *which* runs — which is the whole
 * point of citing them, since a conclusion whose evidence cannot be identified
 * is one nobody can check.
 */
export interface CitedTraining {
  _id: string;
  name: string;
  status: string;
}

export type FindingWithCitations = ReturnType<typeof toPlain> & {
  citedTrainings: CitedTraining[];
};

const toPlain = (finding: IFinding) => finding.toObject() as Record<string, unknown>;

/**
 * Name the runs a set of findings cite, in one query for the whole page.
 *
 * Resolved here rather than by the caller because it is one lookup for every
 * finding in the listing — doing it per row would be an N+1 on a panel that
 * routinely shows a dozen.
 *
 * Cited runs are filtered by project visibility, which is not redundant with
 * the check on the finding itself: nothing stops a finding on a public project
 * citing a run in a private one, and the run's *name* would then be readable by
 * someone who cannot see the run. A run the reader may not see is left out of
 * the names but still counted in `trainingIds`, so the citation count stays
 * honest rather than quietly shrinking.
 */
async function attachCitations(
  findings: IFinding[],
  userId: string | undefined
): Promise<FindingWithCitations[]> {
  const cited = [...new Set(findings.flatMap((finding) => finding.trainingIds))];
  if (cited.length === 0) {
    return findings.map((finding) => ({ ...toPlain(finding), citedTrainings: [] }));
  }

  const runs = await Training.find({ _id: { $in: cited }, deletedAt: null }).select(
    'name status projectId'
  );

  const hasProjectAccess = createProjectAccessChecker(userId);
  const byId = new Map<string, CitedTraining>();
  for (const run of runs) {
    if (await hasProjectAccess(run.projectId)) {
      byId.set(run._id.toString(), {
        _id: run._id.toString(),
        name: run.name,
        status: run.status
      });
    }
  }

  return findings.map((finding) => ({
    ...toPlain(finding),
    citedTrainings: finding.trainingIds
      .map((id) => byId.get(id))
      .filter((run): run is CitedTraining => run !== undefined)
  }));
}

export interface ListFindingsFilters {
  project?: string;
  training?: string;
  limit?: number;
  before?: string;
}

export const listFindings = async (
  userId: string | undefined,
  filters: ListFindingsFilters
): Promise<FindingWithCitations[]> => {
  const query: Record<string, unknown> = { deletedAt: null };

  if (filters.project) {
    const projectId = await resolveProjectId(filters.project);
    if (!(await checkProjectAccess(userId, projectId))) throw new ForbiddenError();
    query.projectId = projectId;
  } else {
    // Privacy must be part of the query before the page limit is applied.
    query.projectId = { $in: await getVisibleProjectIds(userId) };
  }

  if (filters.training) {
    // Matches whether the run is the subject or merely cited, so a finding
    // comparing a dozen runs surfaces from any one of them.
    query.$or = [{ trainingId: filters.training }, { trainingIds: filters.training }];
  }

  if (filters.before !== undefined) {
    const { createdAt, id } = parseFindingCursor(filters.before);
    // Keep this separate from the subject-or-citation condition above.
    query.$and = [{ $or: [
      { createdAt: { $lt: createdAt } },
      { createdAt, _id: { $lt: id } },
    ] }];
  }

  const findings = await Finding.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(filters.limit ?? 50, 200));

  return attachCitations(findings, userId);
};

export const getFinding = async (
  id: string,
  userId: string | undefined
): Promise<FindingWithCitations> => {
  const finding = await Finding.findOne({ _id: id, deletedAt: null });
  if (!finding) throw new NotFoundError('Finding not found');
  if (!(await checkProjectAccess(userId, finding.projectId))) throw new ForbiddenError();

  const [withCitations] = await attachCitations([finding], userId);
  return withCitations;
};

export interface CreateFindingInput {
  project: string;
  training?: string;
  title: string;
  body: string;
  recommendations?: string;
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
): Promise<FindingWithCitations> => {
  const projectId = await resolveProjectId(input.project);
  if (!(await checkProjectAccess(author.userId, projectId))) throw new ForbiddenError();

  // Writing to a project you can only read would let anyone annotate any public
  // project. Findings are the owner's record, not a comment section.
  const project = await Project.findById(projectId);
  if (!(await canEditProject(project, author.userId))) {
    throw new ForbiddenError('Project edit permission is required to record findings');
  }

  // The subject run is always among the citations, never only `trainingId`.
  // `trainingIds ?? [training]` dropped it whenever both were given — so a
  // finding about t1 citing t2 and t3 named every run it compared against and
  // not the one it was about, which is the first thing a reader looks for.
  // Subject first, because that is the run the conclusion is nominally about.
  const cited = [
    ...new Set([...(input.training ? [input.training] : []), ...(input.trainingIds ?? [])])
  ];
  if (cited.length > 0) {
    if (tokenProjectId()) {
      const trainings = await Training.find({ _id: { $in: cited }, deletedAt: null });
      for (const training of trainings) {
        if (!(await checkProjectAccess(author.userId, training.projectId))) throw new ForbiddenError();
      }
    }
    // A citation naming a run that does not exist makes the finding unverifiable
    // by exactly the reader who would want to check it.
    const found = await Training.countDocuments({ _id: { $in: cited }, deletedAt: null });
    if (found !== new Set(cited).size) {
      throw new BadRequestError('One or more cited training ids do not exist');
    }
  }

  const finding = await Finding.create({
    projectId,
    trainingId: input.training,
    title: input.title,
    body: input.body,
    recommendations: input.recommendations,
    trainingIds: cited,
    authorKind: author.kind,
    authorLabel: author.label,
    authorUserId: author.userId
  });

  // Named here too, so `citedTrainings` is present on every finding this
  // service hands back rather than on two endpoints out of three.
  const [withCitations] = await attachCitations([finding], author.userId);
  return withCitations;
};

/**
 * A finding as a LaTeX section, with its results table built from the runs it
 * cites.
 *
 * The epochs are loaded here and the numbers formatted in `latexExport`, so
 * nothing in the table has passed through prose on its way to the page. Only
 * runs the caller may see contribute rows — the same rule the citation names
 * follow, for the same reason.
 */
export const exportFindingAsLatex = async (
  id: string,
  userId: string | undefined,
  options: ExportOptions = {}
): Promise<{ filename: string; tex: string }> => {
  const finding = await getFinding(id, userId);

  const visibleIds = finding.citedTrainings.map((run) => run._id);
  const epochs =
    visibleIds.length > 0
      ? await Epoch.find({ trainingId: { $in: visibleIds }, deletedAt: null })
          .select('trainingId epoch results')
          .sort({ trainingId: 1, epoch: 1 })
      : [];

  const byTraining = new Map<string, ExportRun['epochs']>();
  for (const epoch of epochs) {
    const bucket = byTraining.get(epoch.trainingId) ?? [];
    bucket.push({ epoch: epoch.epoch, results: epoch.results });
    byTraining.set(epoch.trainingId, bucket);
  }

  const runs: ExportRun[] = finding.citedTrainings.map((run) => ({
    _id: run._id,
    name: run.name,
    epochs: byTraining.get(run._id) ?? []
  }));

  return {
    filename: `${slugForFile(finding.title as string)}.tex`,
    tex: findingToLatex(
      {
        _id: String(finding._id),
        title: finding.title as string,
        body: finding.body as string,
        recommendations: finding.recommendations as string | undefined,
        authorKind: finding.authorKind as 'person' | 'assistant',
        authorLabel: finding.authorLabel as string,
        createdAt: finding.createdAt as Date
      },
      runs,
      options
    )
  };
};

/** A filename from a title: lowercase words, nothing a shell or a filesystem minds. */
const slugForFile = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'finding';

export const deleteFinding = async (id: string, userId: string | undefined): Promise<void> => {
  const finding = await Finding.findOne({ _id: id, deletedAt: null });
  if (!finding) throw new NotFoundError('Finding not found');
  if (tokenProjectId() && !(await checkProjectAccess(userId, finding.projectId))) throw new ForbiddenError();

  const project = await Project.findById(finding.projectId);
  if (!(await canEditProject(project, userId))) throw new ForbiddenError();

  // Soft, like every other delete here: a conclusion someone acted on is worth
  // being able to recover.
  finding.deletedAt = new Date();
  await finding.save();
};
