import { BadRequestError } from '@visin/backend-core';
import type { Request } from 'express';
import { peer, type Project } from './access';

/** What a question to the analyst is about, as the person sent it: ids only, never names. */
export interface AskedAbout {
  projectId?: string;
  trainingIds: string[];
  paperId?: string;
}

/** The same, once checked: with the names the project, runs and paper have now. */
export interface VerifiedAbout {
  projectId?: string;
  projectName?: string;
  trainingIds: string[];
  trainingLabels: { id: string; name: string }[];
  paperId?: string;
  paperTitle?: string;
}

/**
 * Checks, as the asker, that what a question is about can be read: the project, each run in it, or the paper. One
 * the person may not read is refused, never dropped, so an answer is never given about something it was not asked on.
 */
export async function verifyAbout(req: Request, asked: AskedAbout): Promise<VerifiedAbout> {
  if (asked.paperId && (asked.projectId || asked.trainingIds.length))
    throw new BadRequestError('Ask about a paper on its own, not together with a project');
  if (asked.trainingIds.length && !asked.projectId) throw new BadRequestError('Select a project for these runs');
  const about: VerifiedAbout = { trainingIds: [], trainingLabels: [] };
  if (asked.projectId) {
    const project = await peer<Project>('VISION', `/api/projects/${asked.projectId}`, req);
    about.projectId = project._id;
    about.projectName = project.name;
    // Looked up together: a comparison is up to twenty runs, and one at a time held the send for each.
    const runs = await Promise.all(
      [...new Set(asked.trainingIds)].map(async (training) => ({
        id: training,
        run: await peer<{ projectId: string; name: string }>('VISION', `/api/trainings/${training}`, req)
      }))
    );
    for (const { id, run } of runs) {
      if (String(run.projectId) !== about.projectId)
        throw new BadRequestError('Selected runs must belong to the selected project');
      about.trainingIds.push(id);
      about.trainingLabels.push({ id, name: run.name });
    }
  }
  if (asked.paperId) {
    const paper = await peer<{ id: string; title: string }>('VISION', `/api/papers/${asked.paperId}`, req);
    about.paperId = paper.id;
    about.paperTitle = paper.title;
  }
  return about;
}
