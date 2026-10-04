import { canChangeItem, ForbiddenError, NotFoundError, UnauthorizedError } from '@visin/backend-core';
import Training from '../models/Training';
import Comparison from '../models/Comparison';
import Benchmark from '../models/Benchmark';
import Evaluation from '../models/Evaluation';
import { canWriteResource } from './writeAccessService';
import { canEditProject, projectPermission, resolveProject } from './projectAccessService';
import { assertBenchmarkWrite } from './benchmarkService';

export type WritableKind = 'project' | 'training' | 'comparison' | 'benchmark' | 'evaluation';

export async function getWriteCapabilities(kind: WritableKind, ids: string[], userId?: string): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  for (const id of ids) {
    result[id] = false;
    if (!userId) continue;
    try {
      switch (kind) {
        // Adding to it: a run, a comparison, a finding.
        case 'project': result[id] = await canEditProject(await resolveProject(id), userId); break;
        case 'training': result[id] = await canWriteResource(await Training.findById(id), userId); break;
        case 'comparison': result[id] = await canWriteResource(await Comparison.findById(id), userId, true); break;
        case 'benchmark': {
          const benchmark = await Benchmark.findOne({ _id: id, deletedAt: null });
          if (benchmark) { await assertBenchmarkWrite(benchmark, userId); result[id] = true; }
          break;
        }
        case 'evaluation': {
          const evaluation = await Evaluation.findOne({ _id: id, deletedAt: null });
          const project = evaluation ? await resolveProject(evaluation.projectId) : null;
          if (evaluation && userId && canChangeItem(await projectPermission(project, userId), evaluation.ownerId, userId)) result[id] = true;
          break;
        }
      }
    } catch (error) {
      if (!(error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof UnauthorizedError)) throw error;
    }
  }
  return result;
}
