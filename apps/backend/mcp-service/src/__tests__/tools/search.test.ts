import { vi, type Mock } from 'vitest';
vi.mock('../../vision', () => ({
  vision: { listProjects: vi.fn(), listTrainings: vi.fn(), listPapers: vi.fn(), listSuites: vi.fn() }
}));
vi.mock('../../datasets', () => ({ datasets: { list: vi.fn() } }));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vision } from '../../vision';
import { datasets } from '../../datasets';
import { VisinError } from '../../http';
import { searchRead, textSearchOf } from '../../tools/search';

const v = vision as unknown as Record<string, Mock>;
const d = datasets as unknown as Record<string, Mock>;
type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

const call = async (args: Record<string, unknown>) => {
  const found: Record<string, Handler> = {};
  const server = { registerTool: (n: string, _c: unknown, h: Handler) => void (found[n] = h) } as unknown as McpServer;
  searchRead.register(server, { token: 'k' });
  const result = await found.search_visin(args);
  return { text: result.content[0].text, isError: result.isError === true };
};

const project = (id: string, name: string, description?: string) => ({ _id: id, name, description, visibility: 'public' });

beforeEach(() => {
  vi.clearAllMocks();
  v.listProjects.mockResolvedValue([]);
  v.listTrainings.mockResolvedValue({ trainings: [] });
  v.listPapers.mockResolvedValue({ papers: [] });
  v.listSuites.mockResolvedValue({ suites: [] });
  d.list.mockResolvedValue({ datasets: [] });
});

describe('textSearchOf', () => {
  it('joins the terms, and passes on no phrase or "not" a model did not mean', () => {
    expect(textSearchOf(['autonomous vehicles', 'lidar'])).toBe('autonomous vehicles lidar');
    expect(textSearchOf(['"night driving"', '-rain', 'semi-supervised'])).toBe('night driving rain semi-supervised');
  });
});

describe('search_visin', () => {
  it('counts the runs there are in all, not only the ones read', async () => {
    v.listTrainings.mockResolvedValue({
      trainings: [{ _id: 'r1', name: 'night run' }],
      pagination: { total: 30 }
    });
    const { text } = await call({ terms: ['night'], limit: 1 });
    expect(text).toContain('Runs (30):');
    expect(text).toContain('…and 29 more');
  });

  it('asks every term, lists a project found by two of them once, and gives each hit an id and a link', async () => {
    v.listProjects.mockResolvedValue([project('p1', 'Urban driving', 'Lane segmentation')]);
    d.list.mockImplementation(async (_key: string, query: { searchTerms: string }) => ({
      datasets: JSON.parse(query.searchTerms).includes('driving')
        ? [{ _id: 'd1', name: 'KITTI', description: 'Road scenes', imageCount: 14999 }]
        : []
    }));
    v.listPapers.mockResolvedValue({ papers: [{ id: 'a1', title: 'LiDAR fusion', year: 2026, authors: [], tags: [], visibility: 'public' }] });

    const { text, isError } = await call({ terms: ['autonomous vehicles', 'driving'] });
    expect(isError).toBe(false);
    // A text index matches any of the words, so projects and runs take every term in one request each.
    expect(v.listProjects).toHaveBeenCalledTimes(1);
    expect(v.listProjects).toHaveBeenCalledWith('k', 'autonomous vehicles driving');
    expect(v.listTrainings).toHaveBeenCalledTimes(1);
    expect(v.listTrainings).toHaveBeenCalledWith('k', { search: 'autonomous vehicles driving', limit: 8 });
    // Dataset substrings are batched; papers by identifier still take one term each.
    expect(d.list).toHaveBeenCalledTimes(1);
    expect(d.list).toHaveBeenCalledWith('k', { searchTerms: JSON.stringify(['autonomous vehicles', 'driving']), limit: 8 });
    expect(v.listPapers).toHaveBeenCalledTimes(2);
    expect(text.match(/KITTI/g)).toHaveLength(1);
    expect(text).toContain('Searched for: “autonomous vehicles”, “driving”.');
    expect(text.match(/Urban driving/g)).toHaveLength(1);
    expect(text).toContain('Projects (1):');
    expect(text).toContain('[p1]  /projects/p1');
    expect(text).toContain('KITTI — Road scenes (14,999 images)  [d1]  /datasets/d1');
    expect(text).toContain('LiDAR fusion (2026)  [a1]  /papers/a1');
    expect(text).toContain('never say a private item does not exist');
  });

  it('asks the server for suites by each term, and lists one found by two of them once', async () => {
    const road = { slug: 'road-seg', version: 2, name: 'Road segmentation', protocol: { task: 'driving scenes' } };
    v.listSuites.mockImplementation(async (_key: string, query: { search: string }) => ({
      suites: ['road', 'driving'].includes(query.search) ? [road] : []
    }));
    const { text } = await call({ terms: ['road', 'driving', 'birds'] });
    expect(v.listSuites).toHaveBeenCalledTimes(3);
    expect(v.listSuites).toHaveBeenCalledWith('k', { search: 'birds', limit: 8 });
    expect(text).toContain('Suites (1):');
    expect(text.match(/Road segmentation/g)).toHaveLength(1);
    expect(text).toContain('/suites/road-seg/2');
  });

  it('says what was searched when nothing is found, and never claims the thing does not exist', async () => {
    const { text } = await call({ terms: ['zebra crossing'] });
    expect(text).toContain('Searched for: “zebra crossing”.');
    expect(text).toContain('Nothing among what you can see matches any of those words.');
  });

  it('names a kind it could not search instead of leaving it out, and still returns the others', async () => {
    d.list.mockRejectedValue(new VisinError(503, 'dataset-service is unavailable'));
    v.listProjects.mockResolvedValue([project('p1', 'Urban driving')]);
    const { text, isError } = await call({ terms: ['driving'] });
    expect(isError).toBe(false);
    expect(text).toContain('Datasets: not searched');
    expect(text).toContain('Urban driving');
  });

  it('shows at most `limit` of a kind and says how many more there are', async () => {
    v.listProjects.mockResolvedValue(Array.from({ length: 5 }, (_, i) => project(`p${i}`, `Project ${i}`)));
    const { text } = await call({ terms: ['project'], limit: 2 });
    expect(text).toContain('Projects (5):');
    expect(text).toContain('…and 3 more');
    expect(text).not.toContain('Project 4');
  });
});
