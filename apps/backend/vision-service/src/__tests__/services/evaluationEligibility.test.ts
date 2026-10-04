import { exploratoryReport, validateEvaluation } from '../../services/evaluationEligibility';
import { buildLeaderboard, selectEvaluations, summarize, type Candidate } from '../../services/leaderboardProjection';
import { suiteProtocolSchema, type SuiteProtocolInput } from '../../validation/suiteSchemas';

const build = (aggregation: string, direction: 'max' | 'min' = 'max') =>
  suiteProtocolSchema.parse({
    task: 'seg',
    data: { kind: 'external', label: 'x', manifestSha256: 'a'.repeat(64) },
    split: 'test',
    conditions: [{ name: 'day', sampleCount: 300 }, { name: 'night', sampleCount: 100 }],
    metrics: [{ key: 'm', direction, headline: true, range: { min: 0, max: 1 } }],
    aggregation,
    evaluator: { package: 'p' }
  } satisfies SuiteProtocolInput | Record<string, unknown>);
const observed = {
  data: { kind: 'external' as const, manifestSha256: 'a'.repeat(64) },
  protocolDigest: 'd',
  evaluator: { package: 'p', version: '1.0.0' }
};
const input = (extra: Record<string, unknown> = {}) => ({
  status: 'completed' as const,
  evidence: observed,
  checkpointKey: 'hf:a/b@c',
  sampleCounts: { day: 300, night: 100 },
  results: { day: { overall: { m: 0.5 } }, night: { overall: { m: 0.9 } } },
  ...extra
});

describe('validateEvaluation', () => {
  it('weights conditions by their declared sample counts when the suite says so', () => {
    const report = validateEvaluation(build('sample-weighted-mean'), 'd', input());
    expect(report.scores?.overall.m).toBeCloseTo(0.6);
    expect(validateEvaluation(build('equal-mean-of-conditions'), 'd', input()).scores?.overall.m).toBeCloseTo(0.7);
  });

  it('reads a pooled overall from the result, and refuses a pooled suite without one', () => {
    const pooled = build('pooled');
    expect(validateEvaluation(pooled, 'd', input({ results: { day: { overall: { m: 0.5 } }, night: { overall: { m: 0.9 } }, overall: { m: 0.55 } } })).scores?.overall.m).toBe(0.55);
    expect(validateEvaluation(pooled, 'd', input()).reasons).toEqual([{ code: 'missing-overall', detail: 'm' }]);
    const wild = validateEvaluation(pooled, 'd', input({ results: { day: { overall: { m: 0.5 } }, night: { overall: { m: 0.9 } }, overall: { m: 5 } } }));
    expect(wild.state).toBe('incompatible');
    expect(wild.reasons).toEqual([{ code: 'metric-out-of-range', detail: 'overall/m' }]);
  });

  it('does not take a missing metric for a zero or a string for a number', () => {
    const report = validateEvaluation(build('equal-mean-of-conditions'), 'd', input({ results: { day: { overall: { m: 'n/a' } }, night: { overall: {} } } }));
    expect(report.state).toBe('incomplete');
    expect(report.reasons).toEqual([
      { code: 'missing-metric', detail: 'day/m' },
      { code: 'missing-metric', detail: 'night/m' }
    ]);
    expect(report.scores).toBeUndefined();
  });

  it('asks for the sample counts rather than assuming them', () => {
    const report = validateEvaluation(build('equal-mean-of-conditions'), 'd', input({ sampleCounts: undefined }));
    expect(report.reasons).toEqual([
      { code: 'missing-sample-count', detail: 'day' },
      { code: 'missing-sample-count', detail: 'night' }
    ]);
  });

  it('reports incompatible ahead of incomplete, since sending the rest would not make it comparable', () => {
    const report = validateEvaluation(build('equal-mean-of-conditions'), 'd', input({ evidence: { ...observed, protocolDigest: 'other' }, checkpointKey: undefined }));
    expect(report.state).toBe('incompatible');
    expect(report.reasons.map(reason => reason.code)).toEqual(['protocol-mismatch', 'no-checkpoint']);
  });

  it('refuses results that are not an object, and says a result with no suite is exploratory', () => {
    for (const results of [null, 'x', [1]]) {
      expect(validateEvaluation(build('pooled'), 'd', input({ results })).reasons).toEqual([{ code: 'results-not-an-object' }]);
    }
    expect(exploratoryReport()).toMatchObject({ state: 'exploratory', evidence: 'none', reasons: [{ code: 'no-suite' }] });
    expect(exploratoryReport().evidence).toBe('none');
  });
});

describe('observed evidence', () => {
  const judge = (evidence: unknown, protocol = build('equal-mean-of-conditions')) =>
    validateEvaluation(protocol, 'd', input({ evidence }));

  it('ranks a result whose evidence matches the suite, and says the evidence was observed', () => {
    expect(judge(observed)).toMatchObject({ state: 'eligible', evidence: 'observed', reasons: [], warnings: [] });
  });

  it('ranks a result with missing evidence as reported, and says in warnings what would make it observed', () => {
    for (const [dropped, code] of [['data', 'no-data-evidence'], ['protocolDigest', 'no-protocol-evidence'], ['evaluator', 'no-evaluator-evidence']] as const) {
      const evidence = { ...observed, [dropped]: undefined };
      expect(judge(evidence)).toMatchObject({ state: 'eligible', evidence: 'reported', reasons: [], warnings: [{ code }] });
    }
    const none = validateEvaluation(build('equal-mean-of-conditions'), 'd', input({ evidence: undefined }));
    expect(none).toMatchObject({ state: 'eligible', evidence: 'reported', reasons: [] });
    expect(none.warnings.map(warning => warning.code)).toEqual(['no-data-evidence', 'no-protocol-evidence', 'no-evaluator-evidence']);
  });

  it('still refuses a part of the evidence that was sent and does not match, even when the rest is missing', () => {
    const wrong = judge({ protocolDigest: 'other' });
    expect(wrong).toMatchObject({ state: 'incompatible', evidence: 'reported', reasons: [{ code: 'protocol-mismatch' }] });
    expect(judge({ data: { kind: 'external', manifestSha256: 'b'.repeat(64) } }).reasons).toEqual([{ code: 'data-mismatch', detail: 'manifestSha256' }]);
  });

  it('refuses equal sample counts on different data, naming the field that differs', () => {
    const other = (data: unknown) => judge({ ...observed, data });
    expect(other({ kind: 'external', manifestSha256: 'b'.repeat(64) }).reasons).toEqual([{ code: 'data-mismatch', detail: 'manifestSha256' }]);
    expect(other({ kind: 'visin', archiveSha256: 'a'.repeat(64) }).reasons).toEqual([{ code: 'data-mismatch', detail: 'kind' }]);
    expect(other({ kind: 'external', manifestSha256: 'b'.repeat(64) }).state).toBe('incompatible');
  });

  it('compares a Visin archive digest and a Hub repo and commit', () => {
    const visin = suiteProtocolSchema.parse({ ...build('pooled'), data: { kind: 'visin', datasetId: 'd1', archiveSha256: 'c'.repeat(64) } });
    expect(judge({ ...observed, data: { kind: 'visin', archiveSha256: 'c'.repeat(64) } }, visin).state).toBe('incomplete');
    const pooled = (protocol: typeof visin, data: unknown) =>
      validateEvaluation(protocol, 'd', input({ evidence: { ...observed, data }, results: { day: { overall: { m: 0.5 } }, night: { overall: { m: 0.9 } }, overall: { m: 0.7 } } }));
    expect(pooled(visin, { kind: 'visin', archiveSha256: 'c'.repeat(64) }).state).toBe('eligible');
    expect(pooled(visin, { kind: 'visin', archiveSha256: 'd'.repeat(64) }).reasons).toEqual([{ code: 'data-mismatch', detail: 'archiveSha256' }]);
    const hub = suiteProtocolSchema.parse({ ...build('pooled'), data: { kind: 'hf', repo: 'Org/Data', commit: 'e'.repeat(40) } });
    expect(pooled(hub, { kind: 'hf', repo: 'org/data', commit: 'e'.repeat(40) }).state).toBe('eligible');
    expect(pooled(hub, { kind: 'hf', repo: 'org/other', commit: 'e'.repeat(40) }).reasons).toEqual([{ code: 'data-mismatch', detail: 'repo' }]);
    expect(pooled(hub, { kind: 'hf', repo: 'org/data', commit: 'f'.repeat(40) }).reasons).toEqual([{ code: 'data-mismatch', detail: 'commit' }]);
  });

  it('checks the evaluator package and enforces its minimum version', () => {
    const minimum = suiteProtocolSchema.parse({ ...build('equal-mean-of-conditions'), evaluator: { package: 'p', minVersion: '1.4.0' } });
    const run = (evaluator: unknown) => judge({ ...observed, evaluator }, minimum);
    expect(run({ package: 'p', version: '1.4.0' }).state).toBe('eligible');
    expect(run({ package: 'p', version: '2.0' }).state).toBe('eligible');
    expect(run({ package: 'q', version: '9' }).reasons).toEqual([{ code: 'evaluator-mismatch', detail: 'q' }]);
    expect(run({ package: 'p', version: '1.3.9' }).reasons).toEqual([{ code: 'evaluator-unsupported', detail: 'p 1.3.9 < 1.4.0' }]);
    expect(run({ package: 'p', version: '1.4.0rc1' }).reasons).toEqual([{ code: 'evaluator-unsupported', detail: 'p 1.4.0rc1 < 1.4.0' }]);
    expect(run({ package: 'p', version: 'main' }).reasons).toEqual([{ code: 'evaluator-unsupported', detail: 'p main < 1.4.0' }]);
    expect(judge({ ...observed, evaluator: { package: 'p', version: 'main' } }).state).toBe('eligible');
  });

  it('compares class evidence when it is sent and ignores it when it is not', () => {
    const classes = suiteProtocolSchema.parse({
      ...build('equal-mean-of-conditions'),
      classes: [{ id: 'car' }, { id: 'tree' }, { id: 'void' }],
      ignoredClasses: ['void']
    });
    expect(judge(observed, classes)).toMatchObject({ state: 'eligible', evidence: 'observed', warnings: [] });
    expect(judge({ ...observed, classes: { scored: ['tree', 'car'], ignored: ['void'] } }, classes)).toMatchObject({ state: 'eligible', warnings: [] });
    expect(judge({ ...observed, classes: { scored: ['car'], ignored: ['void'] } }, classes).reasons).toEqual([{ code: 'class-mismatch', detail: 'scored' }]);
    expect(judge({ ...observed, classes: { scored: ['car', 'tree'], ignored: [] } }, classes).reasons).toEqual([{ code: 'class-mismatch', detail: 'ignored' }]);
    expect(judge(observed).warnings).toEqual([]);
  });

  it('does not let a repeated class id stand in for one that was not scored', () => {
    const classes = suiteProtocolSchema.parse({ ...build('equal-mean-of-conditions'), classes: [{ id: 'car' }, { id: 'bus' }] });
    expect(judge({ ...observed, classes: { scored: ['car', 'car'], ignored: [] } }, classes).reasons).toEqual([{ code: 'class-mismatch', detail: 'scored' }]);
    expect(judge({ ...observed, classes: { scored: ['bus', 'car', 'bus'], ignored: [] } }, classes).state).toBe('eligible');
    expect(judge({ ...observed, classes: { scored: ['car', 'bus'], ignored: ['void', 'void'] } }, classes).reasons).toEqual([{ code: 'class-mismatch', detail: 'ignored' }]);
  });

  it('does not compare observed evidence for a promoted result, and says it was attested', () => {
    const attested = validateEvaluation(build('equal-mean-of-conditions'), 'd', input({ evidence: undefined, attested: true }));
    expect(attested).toMatchObject({ state: 'eligible', evidence: 'attested', reasons: [] });
    const wrong = validateEvaluation(build('equal-mean-of-conditions'), 'd', input({ evidence: { ...observed, protocolDigest: 'x' }, attested: true }));
    expect(wrong.state).toBe('eligible');
  });

  it('reports a failed run by the evidence it carried', () => {
    expect(validateEvaluation(build('pooled'), 'd', input({ status: 'failed' }))).toMatchObject({ state: 'incomplete', evidence: 'observed' });
    expect(validateEvaluation(build('pooled'), 'd', input({ status: 'failed', evidence: undefined })).evidence).toBe('reported');
  });
});

const candidate = (id: string, key: string, at: string, overrides: Partial<Candidate> = {}): Candidate => ({
  id,
  checkpointKey: key,
  status: 'completed',
  state: 'eligible',
  receivedAt: new Date(at),
  scores: { conditions: { day: { m: 0.5 }, night: { m: 0.5 } }, overall: { m: 0.5 } },
  ...overrides
});

describe('summarize', () => {
  it('finds the worst condition by direction and never reports a negative gap', () => {
    const scores = { conditions: { day: { m: 0.8 }, night: { m: 0.6 } }, overall: { m: 0.7 } };
    expect(summarize(build('pooled'), scores)).toMatchObject({ worst: { condition: 'night', value: 0.6 }, gap: expect.closeTo(0.1) });
    expect(summarize(build('pooled', 'min'), scores)).toMatchObject({ worst: { condition: 'day', value: 0.8 }, gap: expect.closeTo(0.1) });
    // a pooled overall can sit below its worst condition: the gap is capped, not negative
    expect(summarize(build('pooled'), { ...scores, overall: { m: 0.5 } })?.gap).toBe(0);
  });

  it('returns nothing when a slice the protocol needs is missing', () => {
    expect(summarize(build('pooled'), { conditions: { day: { m: 0.8 } }, overall: { m: 0.7 } })).toBeUndefined();
    expect(summarize(build('pooled'), { conditions: {}, overall: {} })).toBeUndefined();
  });

  it('carries the unit of the headline', () => {
    const protocol = suiteProtocolSchema.parse({ ...build('pooled'), metrics: [{ key: 'm', direction: 'max', headline: true, unit: '%' }] });
    expect(summarize(protocol, { conditions: { day: { m: 1 }, night: { m: 2 } }, overall: { m: 1.5 } })?.headline.unit).toBe('%');
  });
});

describe('selectEvaluations', () => {
  it('takes the latest eligible completed attempt, then the lowest id, and skips the rest', () => {
    const chosen = selectEvaluations([
      candidate('old', 'k', '2026-01-01'),
      candidate('failed', 'k', '2026-03-01', { status: 'failed' }),
      candidate('incomplete', 'k', '2026-04-01', { state: 'incomplete', scores: undefined }),
      candidate('b', 'k', '2026-02-01'),
      candidate('a', 'k', '2026-02-01'),
      candidate('no-scores', 'j', '2026-02-01', { scores: undefined })
    ]);
    expect([...chosen.values()].map(row => [row.checkpointKey, row.id])).toEqual([['k', 'a']]);
  });

  it('keeps one row for a checkpoint in each project, so another project cannot replace a row', () => {
    const chosen = selectEvaluations([
      candidate('mine', 'k', '2026-01-01', { projectId: 'p1' }),
      candidate('theirs', 'k', '2026-02-01', { projectId: 'p2' })
    ]);
    expect([...chosen.values()].map(row => row.id).sort()).toEqual(['mine', 'theirs']);
  });
});

describe('buildLeaderboard', () => {
  it('ranks by the suite direction, ties share a rank, and float residue does not break a tie', () => {
    const at = (value: number) => ({ scores: { conditions: { day: { m: value }, night: { m: value } }, overall: { m: value } } });
    const lower = buildLeaderboard(build('pooled', 'min'), [
      candidate('slow', 'a', '2026-01-01', at(0.4)),
      candidate('fast', 'b', '2026-01-01', at(0.1 + 0.2)),
      candidate('also', 'c', '2026-01-01', at(0.3))
    ]);
    expect(lower.entries.map(entry => [entry.evaluationId, entry.rank])).toEqual([['also', 1], ['fast', 1], ['slow', 3]]);
  });

  it('ties only scores within the epsilon of the group\'s best, whatever order they arrive in', () => {
    const at = (value: number) => ({ scores: { conditions: { day: { m: value }, night: { m: value } }, overall: { m: value } } });
    const rows = [
      candidate('a', 'ka', '2026-01-01', at(0.5)),
      candidate('b', 'kb', '2026-01-01', at(0.50000000075)),
      candidate('c', 'kc', '2026-01-01', at(0.5000000015))
    ];
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const direction of ['max', 'min'] as const) {
      const results = orders.map(order => buildLeaderboard(build('pooled', direction), order.map(index => rows[index])).entries.map(entry => [entry.evaluationId, entry.rank]));
      for (const result of results) expect(result).toEqual(results[0]);
      // the chain a~b~c does not make the endpoints tie: the best two share rank 1 and the far end is third
      expect(results[0]).toEqual(direction === 'max' ? [['c', 1], ['b', 1], ['a', 3]] : [['a', 1], ['b', 1], ['c', 3]]);
    }
  });

  it('lists a checkpoint with no eligible attempt as unranked instead of dropping it', () => {
    const board = buildLeaderboard(build('pooled'), [
      candidate('x1', 'x', '2026-01-01', { state: 'incomplete', scores: undefined }),
      candidate('x2', 'x', '2026-02-01', { state: 'incompatible', scores: undefined })
    ]);
    expect(board.entries).toEqual([]);
    expect(board.unranked).toEqual([{ checkpointKey: 'x', evaluationId: 'x2', state: 'incompatible', attempts: 2 }]);
  });

  it('leaves out an eligible result whose scores cannot be summarised rather than ranking it blind', () => {
    const board = buildLeaderboard(build('pooled'), [candidate('s', 'k', '2026-01-01', { scores: { conditions: {}, overall: {} } })]);
    expect(board.entries).toEqual([]);
    expect(board.unranked).toEqual([{ checkpointKey: 'k', evaluationId: 's', state: 'eligible', attempts: 1 }]);
  });
});
