import { vi } from 'vitest';
import {
  GUEST_TOOLS,
  assertPublicPaper,
  guestRequestBytes,
  guestRequests,
  guestToolLimits,
  runGuestTool,
  type GuestSeen
} from '../../services/guestTools';
import { GUEST_REQUEST_BYTES } from '../../services/guestContext';
import { ADAPTERS } from '../../services/providers';

const realFetch = globalThis.fetch;
const paper = 'b'.repeat(24);
const project = 'c'.repeat(24);
const signal = new AbortController().signal;
const seen = (): GuestSeen => ({ projectIds: new Set(), paperIds: new Set() });
const limits = { rounds: 2, resultBytes: 1000 };
const run = (name: string, input: Record<string, unknown>, extra: { allowed?: boolean; seen?: GuestSeen } = {}) =>
  runGuestTool(
    { id: 't1', name, input },
    { limits, seen: extra.seen ?? seen(), signal, allowed: extra.allowed ?? true }
  );

/** vision-service answers every public read with whatever the test hands it next. */
const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  );

beforeEach(() => {
  process.env.VISION_SERVICE_URL = 'http://vision.invalid';
});
afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = realFetch;
});

describe('what one question may cost', () => {
  const OUT = 1140;
  it('is the usual ceiling and one request with no lookups, and grows with each round and result size', () => {
    expect(guestRequestBytes({ rounds: 0, resultBytes: 6000 }, OUT)).toBe(GUEST_REQUEST_BYTES);
    expect(guestRequests({ rounds: 0, resultBytes: 6000 })).toBe(1);
    const small = guestRequestBytes({ rounds: 1, resultBytes: 500 }, OUT);
    expect(small).toBeGreaterThan(GUEST_REQUEST_BYTES);
    expect(guestRequestBytes({ rounds: 2, resultBytes: 500 }, OUT)).toBeGreaterThan(small);
    expect(guestRequestBytes({ rounds: 1, resultBytes: 3000 }, OUT)).toBeGreaterThan(small);
    // The words a model may write before its calls come back with them, so a longer answer allowance costs more.
    expect(guestRequestBytes({ rounds: 1, resultBytes: 500 }, 2 * OUT)).toBeGreaterThan(small);
    expect(guestRequests({ rounds: 3, resultBytes: 500 })).toBe(4);
  });
  it('holds the worst round: words before the calls, three long calls, and three results at the size limit', () => {
    for (const resultBytes of [500, 3000, 6000]) {
      const one = { rounds: 1, resultBytes };
      const perRound = guestRequestBytes({ rounds: 2, resultBytes }, OUT) - guestRequestBytes(one, OUT);
      const calls = [1, 2, 3].map((n) => ({
        type: 'tool_use',
        id: `toolu_${String(n).repeat(24)}`,
        name: 'read_public_project',
        input: { link: `/projects/${'a'.repeat(120)}`, extra: 'b'.repeat(20) }
      }));
      const message = {
        role: 'assistant',
        // The most a model can write before its calls, at the most bytes a token takes.
        content: [{ type: 'text', text: 'é'.repeat((OUT * 4) / 2) }, ...calls]
      };
      // A result at the limit, as the request carries it: every byte a quote, which escaping doubles.
      const results = ADAPTERS.anthropic.toolResults(
        calls.map((call) => ({ id: call.id, content: '"'.repeat(resultBytes / 2), isError: true }))
      );
      expect(Buffer.byteLength(JSON.stringify([message, ...results]))).toBeLessThanOrEqual(perRound);
    }
  });
  it('reads its limits from the policy', () => {
    expect(guestToolLimits({ guestToolRounds: 3, guestToolResultBytes: 2000 })).toEqual({
      rounds: 3,
      resultBytes: 2000
    });
  });
  it('offers six lookups, each asking for one string and nothing else', () => {
    expect(GUEST_TOOLS.map((tool) => tool.name)).toEqual([
      'search_public_projects',
      'read_public_project',
      'search_public_papers',
      'search_public_runs',
      'read_public_run',
      'read_public_paper'
    ]);
    for (const tool of GUEST_TOOLS) {
      const schema = tool.schema as {
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
      };
      expect(Object.keys(schema.properties)).toHaveLength(1);
      expect(schema.required).toEqual(Object.keys(schema.properties));
      expect(schema.additionalProperties).toBe(false);
    }
  });
});

describe('searching public projects', () => {
  it('lists name, a line on what it studies and its link, and remembers what it showed', async () => {
    answer(200, {
      data: {
        projects: [
          {
            id: project,
            name: 'Urban driving',
            slug: 'urban-driving',
            description: 'Lane segmentation   in\nthe city'
          },
          { id: 'd'.repeat(24), name: 'No slug' },
          { id: 'not an id', name: 'Bad id' },
          { id: 'e'.repeat(24) }
        ]
      }
    });
    const found = seen();
    const result = await run('search_public_projects', { query: 'driving' }, { seen: found });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toEqual([
      { name: 'Urban driving', about: 'Lane segmentation in the city', link: '/projects/urban-driving' },
      { name: 'No slug', about: '', link: `/projects/${'d'.repeat(24)}` }
    ]);
    expect([...found.projectIds].sort()).toEqual([project, 'd'.repeat(24)].sort());
  });
  it('says plainly when nothing matches, and asks for words when given none', async () => {
    answer(200, { data: { projects: [] } });
    expect((await run('search_public_projects', { query: 'zzz' })).content).toContain('No public project matches');
    expect((await run('search_public_projects', { query: '   ' })).content).toBe('Give some words to search for.');
    expect((await run('search_public_projects', {})).content).toBe('Give some words to search for.');
  });
  it('reports an unreadable or oversized catalogue as unavailable, never what was wrong', async () => {
    for (const reply of [
      () => answer(502, '<html>Bad gateway</html>'),
      () => answer(200, 'not json'),
      () => answer(200, 'x'.repeat(600_000))
    ]) {
      reply();
      const result = await run('search_public_projects', { query: 'driving' });
      expect(result).toMatchObject({ isError: true, content: 'That lookup is unavailable right now.' });
    }
  });
});

describe('reading and searching papers', () => {
  it('reads nothing but a project link, and says a private or missing project is not among the public ones', async () => {
    expect((await run('read_public_project', { link: 'https://example.com/x' })).content).toContain(
      'not a project link'
    );
    expect((await run('read_public_project', { link: '/projects/../secret' })).content).toContain('not a project link');
    answer(404, {});
    expect(await run('read_public_project', { link: '/projects/gone' })).toMatchObject({
      isError: true,
      content: 'Not among the public ones.'
    });
  });
  it('lists a paper’s title, first authors, year and summary, and leaves out what is not public', async () => {
    answer(200, {
      data: {
        papers: [
          {
            id: paper,
            title: 'LiDAR fusion',
            authors: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, {}],
            year: 2026,
            abstract: 'Fusion at night.',
            visibility: 'public'
          },
          { id: 'f'.repeat(24), title: 'Draft', visibility: 'private' },
          { id: 'a'.repeat(24), title: 'No authors, no year', visibility: 'public' }
        ]
      }
    });
    const found = seen();
    const rows = JSON.parse((await run('search_public_papers', { query: 'lidar' }, { seen: found })).content);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      title: 'LiDAR fusion',
      authors: ['A', 'B', 'C'],
      year: 2026,
      summary: 'Fusion at night.',
      link: `/papers/${paper}`
    });
    expect(rows[1]).not.toHaveProperty('authors');
    expect(rows[1]).not.toHaveProperty('year');
    expect([...found.paperIds].sort()).toEqual([paper, 'a'.repeat(24)].sort());
  });
  it('says plainly when no paper matches', async () => {
    answer(200, { data: { papers: [] } });
    expect((await run('search_public_papers', { query: 'zzz' })).content).toContain('No public paper matches');
    expect((await run('search_public_papers', { query: '' })).content).toBe('Give some words to search for.');
  });
});

describe('what a round may ask', () => {
  it('answers a lookup beyond the first few, and an unknown one, without running them', async () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    expect(await run('search_public_papers', { query: 'a' }, { allowed: false })).toMatchObject({
      id: 't1',
      isError: true,
      content: expect.stringContaining('Too many lookups')
    });
    expect(await run('read_private_thing', {})).toMatchObject({
      isError: true,
      content: 'That lookup does not exist.'
    });
    expect(fetched).not.toHaveBeenCalled();
  });
  it('cuts a result to the size as a request carries it, quotes and newlines counted twice', async () => {
    answer(200, {
      data: {
        projects: Array.from({ length: 6 }, (_, i) => ({
          id: `${i}`.repeat(24),
          name: `P "${i}"`,
          description: 'x\n"'.repeat(80)
        }))
      }
    });
    const result = await run('search_public_projects', { query: 'x' });
    expect(result.content).toContain('[CUT');
    expect(Buffer.byteLength(JSON.stringify(result.content)) - 2).toBeLessThanOrEqual(limits.resultBytes);
  });
});

describe('a paper that stopped being public', () => {
  it('passes a public paper', async () => {
    answer(200, { data: { visibility: 'public' } });
    await expect(assertPublicPaper(paper, signal)).resolves.toBeUndefined();
  });
  it('refuses one that is private, trashed, missing or hidden from a visitor, without saying which', async () => {
    answer(200, { data: { visibility: 'private' } });
    await expect(assertPublicPaper(paper, signal)).rejects.toThrow('not publicly available');
    answer(200, { data: { visibility: 'public', trashedAt: '2026-11-01' } });
    await expect(assertPublicPaper(paper, signal)).rejects.toThrow('not publicly available');
    answer(200, 'not json');
    await expect(assertPublicPaper(paper, signal)).rejects.toThrow('not publicly available');
    for (const status of [401, 403, 404]) {
      answer(status, {});
      await expect(assertPublicPaper(paper, signal)).rejects.toThrow('not publicly available');
    }
    await expect(assertPublicPaper('not-an-id', signal)).rejects.toThrow('not publicly available');
  });
  it('treats vision failing as unavailable, never as the paper being private', async () => {
    answer(502, '<html>Bad gateway</html>');
    await expect(assertPublicPaper(paper, signal)).rejects.toThrow('unavailable right now');
  });
});

/** Several public reads at once, told apart by their address, as vision answers them. */
const routes = (table: Record<string, unknown>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      const hit = table[path];
      if (hit === undefined) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(hit));
    })
  );
const runId = 'a1'.repeat(12);

describe('public runs', () => {
  it('lists a run’s name, status and link, and remembers its project so the answer is shown only while it is public', async () => {
    routes({
      '/api/public/trainings': {
        data: {
          trainings: [
            { _id: runId, projectId: project, name: 'night run', status: 'completed' },
            { _id: 'not an id', projectId: project, name: 'bad id' },
            { _id: runId, name: 'no project' },
            { _id: runId, projectId: project }
          ]
        }
      }
    });
    const found = seen();
    const rows = JSON.parse((await run('search_public_runs', { query: 'night' }, { seen: found })).content);
    expect(rows).toEqual([{ name: 'night run', status: 'completed', link: `/trainings/${runId}` }]);
    expect([...found.projectIds]).toEqual([project]);
  });
  it('says plainly when none match', async () => {
    routes({ '/api/public/trainings': { data: { trainings: [] } } });
    expect((await run('search_public_runs', { query: 'zzz' })).content).toContain('No public run matches');
    expect((await run('search_public_runs', { query: '' })).content).toBe('Give some words to search for.');
  });
  it('reads a run through its project: the metrics, and no image', async () => {
    routes({
      [`/api/public/projects/${project}`]: { data: { _id: project, visibility: 'public', name: 'Urban driving' } },
      [`/api/public/trainings/${runId}/summary`]: {
        data: {
          training: { projectId: project, name: 'night run', status: 'completed', uuid: 'short' },
          epochCount: 40,
          metrics: [{ path: 'val/mIoU', direction: 'max', best: { epoch: 38, value: 0.7591 } }]
        }
      }
    });
    const found = seen();
    const result = await run('read_public_run', { link: `/trainings/${runId}` }, { seen: found });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toMatchObject({
      name: 'night run',
      epochs: 40,
      metrics: [{ metric: 'val/mIoU', better: 'max', best: '0.7591 at epoch 38' }]
    });
    expect([...found.projectIds]).toEqual([project]);
  });
  it('refuses a run whose project is private or missing, and anything that is not a run link', async () => {
    routes({
      [`/api/public/trainings/${runId}/summary`]: { data: { training: { projectId: project } } },
      [`/api/public/projects/${project}`]: { data: { _id: project, visibility: 'private', name: 'Secret' } }
    });
    expect(await run('read_public_run', { link: `/trainings/${runId}` })).toMatchObject({
      isError: true,
      content: 'Not among the public ones.'
    });
    routes({ [`/api/public/trainings/${runId}/summary`]: { data: { training: {} } } });
    expect((await run('read_public_run', { link: `/trainings/${runId}` })).content).toBe('Not among the public ones.');
    expect((await run('read_public_run', { link: '/projects/x' })).content).toBe('Give a public run link.');
  });
});

describe('reading a public paper', () => {
  it('gives its title, abstract, authors and year, and remembers it', async () => {
    routes({
      [`/api/public/papers/${paper}`]: {
        data: {
          visibility: 'public',
          title: 'LiDAR fusion',
          abstract: 'Fusion  at\nnight.',
          authors: [{ name: 'A' }],
          year: 2026
        }
      }
    });
    const found = seen();
    const result = await run('read_public_paper', { link: `/papers/${paper}` }, { seen: found });
    expect(JSON.parse(result.content)).toMatchObject({
      title: 'LiDAR fusion',
      abstract: 'Fusion at night.',
      year: 2026
    });
    expect([...found.paperIds]).toEqual([paper]);
  });
  it('refuses a paper that is private, and anything that is not a paper link', async () => {
    routes({ [`/api/public/papers/${paper}`]: { data: { visibility: 'private', title: 'Draft' } } });
    expect(await run('read_public_paper', { link: `/papers/${paper}` })).toMatchObject({
      isError: true,
      content: 'Not among the public ones.'
    });
    expect((await run('read_public_paper', { link: '/projects/x' })).content).toBe('Give a public paper link.');
  });
});
