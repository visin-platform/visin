import { createHash } from 'crypto';
import { canonicalJson } from './suiteProtocol';

/** What identifies a result: the parts of an upload a retry repeats and a different result does not. */
export interface EvaluationContent {
  suite?: unknown;
  evidence?: unknown;
  checkpoint?: unknown;
  source?: unknown;
  status: string;
  results: unknown;
  sampleCounts?: unknown;
  executedAt?: Date;
  supersedesId?: string;
}

/**
 * What an upload says, in one canonical string: equal for a retry, different for a different result. The provenance
 * is left out: it says where and by what the result was produced (host, commit, command), which differs when the same
 * evaluation is run again on another machine, and what is stored is the first writer's. The result is what is compared.
 * One function, so that what is stored by a migration and what a retry is compared with can never drift apart.
 */
export const contentHashOf = (content: EvaluationContent): string =>
  createHash('sha256')
    .update(
      canonicalJson({
        suite: content.suite,
        evidence: content.evidence,
        checkpoint: content.checkpoint,
        source: content.source,
        status: content.status,
        results: content.results,
        sampleCounts: content.sampleCounts,
        executedAt: content.executedAt?.toISOString(),
        supersedesId: content.supersedesId
      })
    )
    .digest('hex');
