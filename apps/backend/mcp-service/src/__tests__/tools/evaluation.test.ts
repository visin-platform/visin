jest.mock('../../vision', () => ({
  vision: { listSuites: jest.fn(), getSuite: jest.fn(), getLeaderboard: jest.fn(), getEvaluation: jest.fn() }
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vision } from '../../vision';
import { VisinError } from '../../http';
import { evaluationRead } from '../../tools/evaluation';

const mocked = vision as unknown as Record<string, jest.Mock>;

type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const found: Record<string, Handler> = {};
  const server = { registerTool: (n: string, _c: unknown, h: Handler) => { found[n] = h; } } as unknown as McpServer;
  evaluationRead.register(server, { token: 'k' });
  const result = await found[name](args);
  return { text: result.content[0].text, isError: result.isError === true };
};

const suite = (over: Record<string, unknown> = {}) => ({
  _id: 's1', slug: 'road-test', version: 1, name: 'Road scenes', visibility: 'public',
  protocol: {
    task: 'semantic-segmentation',
    conditions: [{ name: 'day', sampleCount: 1200 }, { name: 'night', sampleCount: 800 }],
    metrics: [{ key: 'mIoU', direction: 'max', headline: true }, { key: 'latency', direction: 'min' }]
  },
  ...over
});

const entry = (rank: number, label: string, worst: [string, number], headline: number, over: Record<string, unknown> = {}) => ({
  evaluationId: `e${rank}`, rank, attempts: 1, checkpoint: { kind: 'local', label },
  summary: { headline: { value: headline }, worst: { condition: worst[0], value: worst[1] }, gap: Number((headline - worst[1]).toFixed(4)) },
  ...over
});

const board = (over: Record<string, unknown> = {}) => ({
  suite: { slug: 'road-test', version: 1, name: 'Road scenes', headline: { key: 'mIoU', direction: 'max' } },
  scope: { candidates: 7 },
  entries: [entry(1, 'clftv2-e40', ['night', 0.69], 0.735, { attempts: 2, evidenceLevel: 'observed' }), entry(2, 'baseline', ['night', 0.58], 0.702, { evidenceLevel: 'reported' })],
  unranked: [],
  pagination: { page: 1, limit: 20, total: 2, pages: 1 },
  ...over
});

beforeEach(() => jest.clearAllMocks());

describe('list_suites', () => {
  it('describes each suite by what it measures, its direction and its conditions', async () => {
    mocked.listSuites.mockResolvedValue({ suites: [suite()] });
    const { text, isError } = await call('list_suites');
    expect(isError).toBe(false);
    expect(text).toContain('1 suites:');
    expect(text).toContain('- road-test@1 — Road scenes [public]');
    expect(text).toContain('ranks by mIoU (higher is better)');
    expect(text).toContain('conditions: day (1,200), night (800)');
  });

  it('passes the project and the archive choice to the API and filters by name or slug', async () => {
    mocked.listSuites.mockResolvedValue({ suites: [suite(), suite({ slug: 'depth', name: 'Depth frames', archivedAt: '2026-01-01' })] });
    const { text } = await call('list_suites', { project: 'road-seg', include_archived: true, search: 'DEPTH' });
    expect(mocked.listSuites).toHaveBeenCalledWith('k', { projectId: 'road-seg', includeArchived: 'true', limit: 100, page: 1 });
    expect(text).toContain('depth@1');
    expect(text).toContain('archived');
    expect(text).not.toContain('road-test@1');
  });

  it('says why when nothing is visible, and when a filter matched nothing', async () => {
    mocked.listSuites.mockResolvedValue({ suites: [] });
    expect((await call('list_suites')).text).toContain('A suite follows its project');
    expect((await call('list_suites', { search: 'x' })).text).toContain('No suite matches');
  });

  it('caps a long list and says so', async () => {
    mocked.listSuites.mockResolvedValue({ suites: Array.from({ length: 60 }, (_, index) => suite({ slug: `s${index}` })) });
    const { text } = await call('list_suites');
    expect(text).toContain('60 suites:');
    expect(text).toContain('Showing the first 50 of 60 suites');
  });

  it('explains a refusal', async () => {
    mocked.listSuites.mockRejectedValue(new VisinError('Forbidden', 403));
    const { text, isError } = await call('list_suites');
    expect(isError).toBe(true);
    expect(text).toContain('does not carry the necessary scope');
  });
});

describe('list_suites across pages', () => {
  const many = (page: number, count = 100) => Array.from({ length: count }, (_, index) => suite({ slug: `s${page}-${index}`, name: `Suite ${page}-${index}` }));

  it('searches every page it can, so a match beyond the first hundred is found', async () => {
    mocked.listSuites.mockImplementation(async (_key: string, query: { page: number }) => ({
      suites: query.page === 2 ? [...many(2, 99), suite({ slug: 'needle', name: 'The needle suite' })] : many(query.page),
      pagination: { total: 250, pages: 3 }
    }));
    const { text } = await call('list_suites', { search: 'needle' });
    expect(mocked.listSuites).toHaveBeenCalledTimes(3);
    expect(text).toContain('1 suites:');
    expect(text).toContain('needle@1');
    expect(text).not.toContain('looked at');
  });

  it('says when a search could not cover every suite, rather than denying one exists', async () => {
    mocked.listSuites.mockImplementation(async (_key: string, query: { page: number }) => ({ suites: many(query.page, 3), pagination: { total: 5000, pages: 50 } }));
    const { text } = await call('list_suites', { search: 'zzz' });
    expect(mocked.listSuites).toHaveBeenCalledTimes(10);
    expect(text).toContain('No suite matches among the first 30 of 5,000');
  });

  it('without a search shows the first page and says how many there are in all', async () => {
    mocked.listSuites.mockResolvedValue({ suites: many(1, 100), pagination: { total: 230, pages: 3 } });
    const { text } = await call('list_suites');
    expect(mocked.listSuites).toHaveBeenCalledTimes(1);
    expect(text).toContain('The first 100 of 230 suites');
  });

  it('notes a search that stopped short of the end', async () => {
    mocked.listSuites.mockImplementation(async (_key: string, query: { page: number }) => ({ suites: [suite({ slug: `hit-${query.page}`, name: `Hit ${query.page}` })], pagination: { total: 5000, pages: 50 } }));
    const { text } = await call('list_suites', { search: 'hit' });
    expect(text).toContain('Searched the first 10 of 5,000 suites');
  });
});

describe('get_leaderboard', () => {
  it('ranks the models with their score, weakest condition, attempts, evidence level and id, and repeats the caveat', async () => {
    mocked.getLeaderboard.mockResolvedValue(board());
    const { text } = await call('get_leaderboard', { suite: 'road-test@1' });
    expect(mocked.getLeaderboard).toHaveBeenCalledWith('k', 'road-test', 1, { limit: 20, page: 1, evidence: undefined });
    expect(text).toContain('Ranked by mIoU, higher is better.');
    expect(text).toContain('2 ranked checkpoints, from 7 evaluations this key can read.');
    expect(text).toContain('1. clftv2-e40 — 0.735; weakest night 0.69 (gap 0.045); 2 attempts [e1]');
    expect(text).toContain('2. baseline — 0.702; weakest night 0.58 (gap 0.122); 1 attempt, reported [e2]');
    expect(text).toContain('has not verified the model or the data');
    expect(text).toContain('not among everything ever run');
  });

  it('names a checkpoint of a kind it does not know by its kind, rather than losing it', async () => {
    mocked.getLeaderboard.mockResolvedValue(board({
      entries: [entry(1, 'x', ['night', 12], 8, { checkpoint: { kind: 's3', bucket: 'models', key: 'clft/best.pt' } }), entry(2, 'y', ['night', 9], 7, { checkpoint: { kind: 'hf', repo: 5 } })]
    }));
    const { text } = await call('get_leaderboard', { suite: 'road-test@1' });
    expect(text).toContain('s3 checkpoint');
    expect(text).toContain('hf checkpoint');
  });

  it('names a Hub checkpoint by repo and short commit, and a lower-is-better suite as such', async () => {
    mocked.getLeaderboard.mockResolvedValue(board({
      suite: { slug: 'speed', version: 3, name: 'Speed', headline: { key: 'latency', direction: 'min', unit: 'ms' } },
      entries: [entry(1, 'x', ['night', 12], 8, { checkpoint: { kind: 'hf', repo: 'acme/clft', commit: '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433' } })]
    }));
    const { text } = await call('get_leaderboard', { suite: 'speed@3' });
    expect(text).toContain('Ranked by latency (ms), lower is better.');
    expect(text).toContain('1. acme/clft @ 3f2a1c9');
  });

  it('asks for observed evidence only, a page and a limit when told to, and says so', async () => {
    mocked.getLeaderboard.mockResolvedValue(board());
    const { text } = await call('get_leaderboard', { suite: 'road-test', observed_only: true, limit: 5, page: 2 });
    expect(mocked.getLeaderboard).toHaveBeenCalledWith('k', 'road-test', 'latest', { limit: 5, page: 2, evidence: 'observed' });
    expect(text).toContain('observed evidence only');
  });

  it('says when nothing is ranked, or nothing qualifies, or the page is past the end', async () => {
    mocked.getLeaderboard.mockResolvedValue(board({ entries: [], pagination: { page: 1, total: 0, pages: 0 } }));
    expect((await call('get_leaderboard', { suite: 'road-test@1' })).text).toContain('Nothing is ranked yet.');
    expect((await call('get_leaderboard', { suite: 'road-test@1', observed_only: true })).text).toContain('No result here has complete observed evidence.');
    mocked.getLeaderboard.mockResolvedValue(board({ entries: [], pagination: { page: 9, total: 2, pages: 1 } }));
    expect((await call('get_leaderboard', { suite: 'road-test@1', page: 9 })).text).toContain('No rows on this page.');
  });

  it('points to the next page when there are more, and counts what could not be ranked with why', async () => {
    mocked.getLeaderboard.mockResolvedValue(board({
      pagination: { page: 1, limit: 2, total: 5, pages: 3 },
      unranked: [{ state: 'incomplete', reasons: [{ code: 'missing-condition' }] }, { state: 'incompatible', reasons: [{ code: 'data-mismatch' }, { code: 'missing-condition' }] }]
    }));
    const { text } = await call('get_leaderboard', { suite: 'road-test@1' });
    expect(text).toContain('Page 1 of 3.');
    expect(text).toContain('2 more checkpoints have attempts but no eligible result (missing-condition, data-mismatch)');
  });

  it('refuses a name that is not a suite and explains a missing suite', async () => {
    expect((await call('get_leaderboard', { suite: 'Road Test!' })).text).toContain('is not a suite name');
    expect((await call('get_leaderboard', { suite: 'road-@1' })).text).toContain('is not a suite name');
    expect(mocked.getLeaderboard).not.toHaveBeenCalled();
    mocked.getLeaderboard.mockRejectedValue(new VisinError('Suite not found', 404));
    expect((await call('get_leaderboard', { suite: 'nope@1' })).isError).toBe(true);
  });
});

describe('get_worst_conditions', () => {
  const record = (over: Record<string, unknown> = {}) => ({
    _id: 'e1', checkpoint: { kind: 'local', label: 'clftv2-e40' }, suite: { slug: 'road-test', version: 1 },
    validation: { state: 'eligible', scores: { conditions: { day: { mIoU: 0.8, latency: 9 }, night: { mIoU: 0.69, latency: 12 }, rain: { mIoU: 0.74, latency: 10 } }, overall: { mIoU: 0.74, latency: 10 } } },
    ...over
  });

  beforeEach(() => mocked.getSuite.mockResolvedValue(suite()));

  it('lists one model\'s conditions from the weakest, on the headline, in the suite\'s direction', async () => {
    mocked.getEvaluation.mockResolvedValue(record());
    const { text } = await call('get_worst_conditions', { suite: 'road-test@1', evaluation: 'e1' });
    expect(mocked.getSuite).toHaveBeenCalledWith('k', 'road-test', 1);
    expect(text).toContain('clftv2-e40 on road-test@1, by mIoU (higher is better); overall 0.74.');
    expect(text.indexOf('1. night — 0.69')).toBeGreaterThan(-1);
    expect(text.indexOf('2. rain — 0.74')).toBeGreaterThan(text.indexOf('1. night'));
    expect(text.indexOf('3. day — 0.8')).toBeGreaterThan(text.indexOf('2. rain'));
  });

  it('puts the highest first when lower is better', async () => {
    mocked.getSuite.mockResolvedValue(suite({ protocol: { ...suite().protocol, metrics: [{ key: 'latency', direction: 'min', headline: true }] } }));
    mocked.getEvaluation.mockResolvedValue(record());
    const { text } = await call('get_worst_conditions', { suite: 'road-test@1', evaluation: 'e1' });
    expect(text).toContain('1. night — 12');
    expect(text).toContain('3. day — 9');
  });

  it('shows each ranked model\'s weakest condition, the worst first, with the id to look closer', async () => {
    mocked.getLeaderboard.mockResolvedValue(board({ entries: [entry(1, 'clftv2-e40', ['night', 0.69], 0.735), entry(2, 'baseline', ['rain', 0.4], 0.702, { evidenceLevel: 'attested' })] }));
    const { text } = await call('get_worst_conditions', { suite: 'road-test@1' });
    expect(mocked.getLeaderboard).toHaveBeenCalledWith('k', 'road-test', 1, { limit: 100, page: 1 });
    expect(text.indexOf('baseline — rain 0.4')).toBeGreaterThan(-1);
    expect(text.indexOf('baseline — rain 0.4')).toBeLessThan(text.indexOf('clftv2-e40 — night 0.69'));
    expect(text).toContain('(overall 0.702, rank 2), attested [e2]');
  });

  it('looks at every page of the ranking, so a model ranked far down is not missed', async () => {
    const rank = (page: number, size: number) => Array.from({ length: size }, (_, index) => entry((page - 1) * 100 + index + 1, `m${page}-${index}`, ['night', 0.9 - index / 1000], 0.95));
    mocked.getLeaderboard.mockImplementation(async (_key: string, _slug: string, _version: unknown, query: { page: number }) =>
      board({ entries: query.page === 3 ? [...rank(3, 9), entry(299, 'collapses-in-the-dark', ['night', 0.05], 0.8)] : rank(query.page, 100), pagination: { page: query.page, total: 210, pages: 3 } })
    );
    const { text } = await call('get_worst_conditions', { suite: 'road-test@1', limit: 3 });
    expect(mocked.getLeaderboard).toHaveBeenCalledTimes(3);
    expect(text.split('\n')[1]).toContain('collapses-in-the-dark — night 0.05');
    expect(text).not.toContain('not examined');
  });

  it('says how many ranked models it did not examine when the ranking is longer than it will read', async () => {
    mocked.getLeaderboard.mockImplementation(async (_key: string, _slug: string, _version: unknown, query: { page: number }) =>
      board({ entries: [entry(query.page, `m${query.page}`, ['night', 0.5], 0.7)], pagination: { page: query.page, total: 5000, pages: 50 } })
    );
    const { text } = await call('get_worst_conditions', { suite: 'road-test@1' });
    expect(mocked.getLeaderboard).toHaveBeenCalledTimes(10);
    expect(text).toContain('Looked at the top 10 of 5,000 ranked models; ones ranked lower were not examined.');
  });

  it('caps the rows it shows and says so', async () => {
    mocked.getLeaderboard.mockResolvedValue(board({ entries: Array.from({ length: 6 }, (_, index) => entry(index + 1, `m${index}`, ['night', 0.5 + index / 100], 0.7)) }));
    const { text } = await call('get_worst_conditions', { suite: 'road-test@1', limit: 3 });
    expect(text).toContain('Showing the first 3 of 6 models');
  });

  it('says when there is nothing to look at, and refuses what it cannot compare', async () => {
    mocked.getLeaderboard.mockResolvedValue(board({ entries: [] }));
    expect((await call('get_worst_conditions', { suite: 'road-test@1' })).text).toContain('Nothing is ranked on road-test@1 yet.');
    mocked.getEvaluation.mockResolvedValue(record({ validation: { state: 'incomplete' } }));
    expect((await call('get_worst_conditions', { suite: 'road-test@1', evaluation: 'e1' })).text).toContain('is incomplete, so it has no ranked scores');
    mocked.getEvaluation.mockResolvedValue(record({ suite: { slug: 'road-test', version: 2 } }));
    const other = await call('get_worst_conditions', { suite: 'road-test@1', evaluation: 'e1' });
    expect(other.isError).toBe(true);
    expect(other.text).toContain('on road-test@2, not road-test@1');
    mocked.getSuite.mockResolvedValue(suite({ protocol: { conditions: [], metrics: [{ key: 'm', direction: 'max' }] } }));
    expect((await call('get_worst_conditions', { suite: 'road-test@1' })).text).toContain('names no headline metric');
    expect((await call('get_worst_conditions', { suite: 'not a suite' })).text).toContain('is not a suite name');
  });
});
