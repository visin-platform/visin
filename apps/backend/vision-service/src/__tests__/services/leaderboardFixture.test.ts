import fs from 'fs';
import path from 'path';
import { validateEvaluation, type EvaluationInput, type ValidationReason } from '../../services/evaluationEligibility';
import { buildLeaderboard, type Candidate } from '../../services/leaderboardProjection';
import { protocolDigest } from '../../services/suiteProtocol';
import { fixtureEvidence } from '../fixtures/fixtureEvidence';
import { evidenceSchema } from '../../validation/evaluationSchemas';
import { suiteProtocolSchema, type SuiteProtocol } from '../../validation/suiteSchemas';

/**
 * The comparison contract: expected states, reasons, ranks, worst conditions and gaps for a fixed set of
 * evaluations, worked out by hand. The API, UI, export and MCP tests read the same file.
 */
interface FixtureEvaluation extends Omit<EvaluationInput, 'evidence'> {
  id: string;
  suite: string;
  checkpoint?: string;
  receivedAt: string;
  /** absent: the suite's own; an object: those keys replace the suite's; null: none was sent */
  evidence?: Record<string, unknown> | null;
}
interface Fixture {
  suites: Record<string, unknown>;
  suiteEvidence: Record<string, Record<string, unknown>>;
  evaluations: FixtureEvaluation[];
  expected: {
    states: Record<string, { state: string; evidence?: string; reasons?: ValidationReason[]; warnings?: ValidationReason[] }>;
    leaderboards: Record<
      string,
      {
        entries: { id: string; rank: number; attempts: number; headline: number; worst: { condition: string; value: number }; gap: number }[];
        unranked: { checkpoint: string; id: string; state: string }[];
      }
    >;
  };
}

const fixture: Fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/leaderboard.json'), 'utf8'));
const protocols = Object.fromEntries(
  Object.entries(fixture.suites).map(([name, raw]) => [name, suiteProtocolSchema.parse(raw)])
) as Record<string, SuiteProtocol>;
const digests = Object.fromEntries(Object.entries(protocols).map(([name, protocol]) => [name, protocolDigest(protocol)]));

const judged = fixture.evaluations.map(evaluation => ({
  evaluation,
  report: validateEvaluation(protocols[evaluation.suite], digests[evaluation.suite], {
    status: evaluation.status,
    results: evaluation.results,
    checkpointKey: evaluation.checkpoint,
    evidence: evidenceSchema.optional().parse(fixtureEvidence(fixture.suiteEvidence[evaluation.suite], evaluation, digests[evaluation.suite])),
    attested: evaluation.attested,
    sampleCounts: evaluation.sampleCounts
  })
}));

describe('the comparison fixture', () => {
  it.each(Object.keys(fixture.expected.states))('judges %s as the contract says', id => {
    const { report } = judged.find(row => row.evaluation.id === id)!;
    const want = fixture.expected.states[id];
    expect(report.state).toBe(want.state);
    expect(report.reasons).toEqual(want.reasons ?? []);
    expect(report.warnings).toEqual(want.warnings ?? []);
    if (want.evidence) expect(report.evidence).toBe(want.evidence);
    expect(Boolean(report.scores)).toBe(want.state === 'eligible');
  });

  it.each(Object.keys(fixture.expected.leaderboards))('ranks the %s suite as the contract says', suite => {
    const candidates: Candidate[] = judged
      .filter(({ evaluation }) => evaluation.suite === suite && evaluation.checkpoint)
      .map(({ evaluation, report }) => ({
        id: evaluation.id,
        checkpointKey: evaluation.checkpoint!,
        status: evaluation.status,
        state: report.state,
        scores: report.scores,
        receivedAt: new Date(evaluation.receivedAt)
      }));
    const board = buildLeaderboard(protocols[suite], candidates);
    const want = fixture.expected.leaderboards[suite];

    expect(board.selection).toBe('latest-eligible-completed');
    expect(board.entries.map(entry => [entry.evaluationId, entry.rank, entry.attempts])).toEqual(
      want.entries.map(entry => [entry.id, entry.rank, entry.attempts])
    );
    board.entries.forEach((entry, index) => {
      expect(entry.summary.headline.value).toBeCloseTo(want.entries[index].headline, 9);
      expect(entry.summary.worst.condition).toBe(want.entries[index].worst.condition);
      expect(entry.summary.worst.value).toBeCloseTo(want.entries[index].worst.value, 9);
      expect(entry.summary.gap).toBeCloseTo(want.entries[index].gap, 9);
    });
    const unranked = [...board.unranked].sort((a, b) => (a.checkpointKey < b.checkpointKey ? -1 : 1));
    expect(unranked.map(row => ({ checkpoint: row.checkpointKey, id: row.evaluationId, state: row.state }))).toEqual(want.unranked);
  });

  it('keeps a valid zero as a zero, ranked last, rather than reading it as missing', () => {
    const { report } = judged.find(row => row.evaluation.id === 'c-zero')!;
    expect(report.scores?.conditions.night.mIoU_foreground).toBe(0);
  });
});
