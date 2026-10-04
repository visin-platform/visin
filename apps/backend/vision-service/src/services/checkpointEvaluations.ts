import Evaluation from '../models/Evaluation';
import Suite from '../models/Suite';
import type { EvidenceLevel } from './evaluationEligibility';
import { readerVisible, type EvaluationScope } from './evaluationScope';

/**
 * What a checkpoint scored on suites, for a page that already shows the checkpoint: its latest eligible evaluation on
 * each suite version, as the suite's headline figure. A checkpoint is matched by its canonical key within the project
 * that holds the link, so a Hub link and a local weights digest are different checkpoints until someone says
 * otherwise, the model's name or epoch is never used to join them, and another project's evaluation of the same
 * Hub model never stands in for this project's.
 */
export interface CheckpointEvaluation {
  evaluationId: string;
  suite: { slug: string; version: number; name: string };
  headline: { key: string; value: number; unit?: string };
  evidence: EvidenceLevel;
  receivedAt: Date;
}

/** The address of one project's checkpoint in the answer of `evaluationsByCheckpoint`. */
export const checkpointAddress = (projectId: string, checkpointKey: string): string => `${projectId}\u0000${checkpointKey}`;

interface Latest {
  _id: { projectId: string; checkpointKey: string; suite: string };
  evaluation: { _id: { toString(): string }; receivedAt: Date; validation: { evidence?: EvidenceLevel; scores?: { overall?: Record<string, number> } } };
}

/**
 * One query for all the checkpoints of a page, one for the suites they name; never a request per row. Only what the
 * caller could see on the evaluations page counts: everything in a project they can add to, and only what a project
 * shows of one they can merely read (a credential limited to one project sees only that project's, as the scope is
 * already confined). The answer is keyed by `checkpointAddress`.
 */
export async function evaluationsByCheckpoint(
  checkpoints: { projectId: string; checkpointKey: string }[],
  scope: EvaluationScope
): Promise<Map<string, CheckpointEvaluation[]>> {
  const found = new Map<string, CheckpointEvaluation[]>();
  const allowed = new Set([...scope.full, ...scope.published]);
  const wanted = checkpoints.filter(item => allowed.has(item.projectId));
  if (wanted.length === 0) return found;
  const asked = new Set(wanted.map(item => checkpointAddress(item.projectId, item.checkpointKey)));
  const latest = await Evaluation.aggregate<Latest>([
    {
      $match: {
        checkpointKey: { $in: [...new Set(wanted.map(item => item.checkpointKey))] },
        projectId: { $in: [...new Set(wanted.map(item => item.projectId))] },
        $or: [
          { projectId: { $in: scope.full } },
          { projectId: { $in: scope.published }, ...readerVisible }
        ],
        deletedAt: null,
        status: 'completed',
        'validation.state': 'eligible',
        supersededById: { $exists: false },
        'suite.id': { $exists: true }
      }
    },
    { $sort: { receivedAt: -1, _id: 1 } },
    {
      $group: {
        _id: { projectId: '$projectId', checkpointKey: '$checkpointKey', suite: '$suite.id' },
        evaluation: { $first: { _id: '$_id', receivedAt: '$receivedAt', validation: { evidence: '$validation.evidence', scores: { overall: '$validation.scores.overall' } } } }
      }
    }
  ]);
  const suites = new Map(
    (await Suite.find({ _id: { $in: [...new Set(latest.map((row) => row._id.suite))] } }).select('slug version name protocol.metrics').lean()).map((suite) => [suite._id.toString(), suite])
  );
  for (const row of latest) {
    const address = checkpointAddress(row._id.projectId, row._id.checkpointKey);
    if (!asked.has(address)) continue;
    const suite = suites.get(row._id.suite);
    const headline = suite?.protocol.metrics.find((metric: { headline?: boolean }) => metric.headline);
    const value = headline && row.evaluation.validation.scores?.overall?.[headline.key];
    if (!suite || !headline || typeof value !== 'number') continue;
    const list = found.get(address) ?? [];
    list.push({
      evaluationId: row.evaluation._id.toString(),
      suite: { slug: suite.slug, version: suite.version, name: suite.name },
      headline: { key: headline.key, value, ...(headline.unit ? { unit: headline.unit } : {}) },
      evidence: row.evaluation.validation.evidence ?? 'none',
      receivedAt: row.evaluation.receivedAt
    });
    found.set(address, list);
  }
  for (const list of found.values()) list.sort((a, b) => a.suite.slug.localeCompare(b.suite.slug) || b.suite.version - a.suite.version);
  return found;
}
