import { ForbiddenError, NotFoundError, UnauthorizedError } from '@visin/backend-core';
import Training from '../models/Training';
import Comparison from '../models/Comparison';
import Benchmark from '../models/Benchmark';
import TestResult from '../models/TestResult';
import { canWriteResource, assertEpochWrite } from './writeAccessService';
import { canEditProject, resolveProject } from './projectAccessService';
import { assertBenchmarkWrite } from './benchmarkService';

export type WritableKind = 'project' | 'training' | 'comparison' | 'benchmark' | 'test-result';

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
        case 'test-result': {
          const test = await TestResult.findOne({ _id: id, deletedAt: null });
          if (test) { await assertEpochWrite(test.epoch_uuid, userId); result[id] = true; }
          break;
        }
      }
    } catch (error) {
      if (!(error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof UnauthorizedError)) throw error;
    }
  }
  return result;
}
