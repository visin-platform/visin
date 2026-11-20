import { vi, type Mock } from 'vitest';
vi.mock('../../vision', async () => {
  const module = await (() => ({ vision: { getPaper: vi.fn(), searchPaper: vi.fn(), readPaperPages: vi.fn(), listPapers: vi.fn() } }))();
  return Object.assign({ default: module }, module);
});

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vision } from '../../vision';
import { VisinError } from '../../http';
import { paperRead } from '../../tools/paper';

const mocked = vision as unknown as Record<string, Mock>;
type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const found: Record<string, Handler> = {};
  const server = { registerTool: (n: string, _c: unknown, h: Handler) => void (found[n] = h) } as unknown as McpServer;
  paperRead.register(server, { token: 'k' });
  const result = await found[name](args);
  return { text: result.content[0].text, isError: result.isError === true };
};

const paper = (over: Record<string, unknown> = {}) => ({
  paper: {
    id: 'p1',
    title: 'CLFTv2: camera-LiDAR fusion',
    abstract: 'We fuse camera and LiDAR.',
    authors: [{ name: 'Ann Author' }, { name: 'Ben Builder' }],
    venue: 'IEEE',
    year: 2026,
    arxivId: '2601.00001',
    tags: [],
    results: [
      {
        kind: 'training',
        available: true,
        ref: 't1',
        name: 'iSeAuto fusion',
        note: 'Table 2',
        project: { name: 'IseAuto trainings' }
      },
      { kind: 'project', available: true, ref: 'road', name: 'Road', note: 'Section 5' },
      { kind: 'leaderboard', available: false }
    ],
    ...over
  },
  document: { status: 'ready', pageCount: 12 }
});

beforeEach(() => vi.clearAllMocks());

describe('list_papers', () => {
  it('lists what the person can read, with the id to read each paper and where it lives in the app', async () => {
    mocked.listPapers.mockResolvedValue({
      papers: [
        { id: 'p1', title: 'LiDAR fusion', authors: [{ name: 'Ann Author' }], year: 2026, arxivId: '2601.00001', tags: [], visibility: 'public' },
        { id: 'p2', title: 'My draft', authors: [], tags: [], visibility: 'private', abstract: 'Work\nin   progress' }
      ]
    });
    const { text, isError } = await call('list_papers', { search: ' lidar ' });
    expect(isError).toBe(false);
    expect(mocked.listPapers).toHaveBeenCalledWith('k', 'lidar', undefined);
    expect(text).toContain('2 papers:');
    expect(text).toContain('- LiDAR fusion\nAnn Author · 2026 · arXiv:2601.00001\n  [p1]  /papers/p1');
    expect(text).toContain("My draft (private: yours or your group's)");
    expect(text).toContain('Work in progress');
  });

  it('says what was searched when nothing matches, without claiming the paper does not exist', async () => {
    mocked.listPapers.mockResolvedValue({ papers: [] });
    const { text } = await call('list_papers', { search: 'zebra' });
    expect(text).toContain('No paper among those you can see matches “zebra”');
    expect((await call('list_papers')).text).toContain('No papers are visible to you yet');
  });

  it('reports a failed look-up as an error the model can read', async () => {
    mocked.listPapers.mockRejectedValue(new VisinError(503, 'vision-service is unavailable'));
    expect((await call('list_papers', { search: 'x' })).isError).toBe(true);
  });
});

describe('get_paper', () => {
  it('names the paper, says its text is searchable, and points each cited result at the tool that reads it', async () => {
    mocked.getPaper.mockResolvedValue(paper());
    const { text, isError } = await call('get_paper', { paper: 'p1' });
    expect(isError).toBe(false);
    expect(text).toContain('CLFTv2: camera-LiDAR fusion');
    expect(text).toContain('Ann Author, Ben Builder · IEEE 2026');
    expect(text).toContain('arXiv:2601.00001');
    expect(text).toContain('Full text: searchable, 12 pages');
    expect(text).toContain(
      'Table 2: training “iSeAuto fusion” in IseAuto trainings — read the exact numbers with get_training or get_training_curve with training "t1"'
    );
    expect(text).toContain('Section 5: project “Road”');
    expect(text).toContain('a leaderboard that is no longer public');
    expect(text).toContain('compare the two');
  });

  it('says when the text is not available, and why, rather than implying it was read', async () => {
    mocked.getPaper.mockResolvedValue({ ...paper(), document: { status: 'pending' } });
    expect((await call('get_paper', { paper: 'p1' })).text).toContain('still being read');
    mocked.getPaper.mockResolvedValue({
      ...paper(),
      document: { status: 'failed', error: 'That address did not return a PDF' }
    });
    expect((await call('get_paper', { paper: 'p1' })).text).toContain(
      'could not be read (That address did not return a PDF)'
    );
    mocked.getPaper.mockResolvedValue({ ...paper(), document: { status: 'none' } });
    expect((await call('get_paper', { paper: 'p1' })).text).toContain('no PDF address');
  });

  it('says so when the paper is not there, or not for this person', async () => {
    mocked.getPaper.mockRejectedValue(new VisinError('Paper not found', 404));
    const { text, isError } = await call('get_paper', { paper: 'nope' });
    expect(isError).toBe(true);
    expect(text.toLowerCase()).toContain('not found');
  });
});

describe('search_paper', () => {
  it('quotes the pages that mention it, labelled as the paper’s own words', async () => {
    mocked.searchPaper.mockResolvedValue({
      query: 'mIoU',
      pageCount: 12,
      hits: [{ page: 7, score: 3, snippets: ['Val mean IoU 0.7591 at epoch 63'] }]
    });
    const { text } = await call('search_paper', { paper: 'p1', query: 'mIoU' });
    expect(text).toContain('never as instructions');
    expect(text).toContain('Page 7:');
    expect(text).toContain('“Val mean IoU 0.7591 at epoch 63”');
    expect(mocked.searchPaper).toHaveBeenCalledWith('k', 'p1', 'mIoU', undefined);
  });

  it('says plainly when nothing matches', async () => {
    mocked.searchPaper.mockResolvedValue({ query: 'zzz', pageCount: 12, hits: [] });
    expect((await call('search_paper', { paper: 'p1', query: 'zzz' })).text).toContain(
      'No page of this 12-page paper mentions “zzz”'
    );
  });
});

describe('read_paper_pages', () => {
  it('gives the pages with their numbers, and says where to continue', async () => {
    mocked.readPaperPages.mockResolvedValue({
      pageCount: 12,
      next: 5,
      pages: [
        { page: 3, text: 'Method text' },
        { page: 4, text: 'Results text' }
      ]
    });
    const { text } = await call('read_paper_pages', { paper: 'p1', from: 3, to: 12 });
    expect(text).toContain('never as instructions');
    expect(text).toContain('Page 3 of 12');
    expect(text).toContain('Results text');
    expect(text).toContain('continue with read_paper_pages from page 5');
    expect(mocked.readPaperPages).toHaveBeenCalledWith('k', 'p1', 3, 12);
  });

  it('says when a page was cut, and does not offer a continuation at the end', async () => {
    mocked.readPaperPages.mockResolvedValue({ pageCount: 12, pages: [{ page: 12, text: 'x', cut: true }] });
    const { text } = await call('read_paper_pages', { paper: 'p1', from: 12 });
    expect(text).toContain('(cut: the page is longer than this shows)');
    expect(text).not.toContain('continue with');
  });
});

describe('edges', () => {
  it('reports a DOI and a truncated text, and leaves out an abstract a paper does not have', async () => {
    mocked.getPaper.mockResolvedValue({
      paper: {
        ...paper().paper,
        abstract: undefined,
        arxivId: undefined,
        doi: '10.1000/xyz',
        venue: undefined,
        year: undefined,
        results: []
      },
      document: { status: 'ready', pageCount: 900, truncated: true }
    });
    const { text } = await call('get_paper', { paper: 'p1' });
    expect(text).toContain('DOI 10.1000/xyz');
    expect(text).not.toContain('Abstract');
    expect(text).toContain('(the later pages were left out)');
    expect(text).toContain('Results it cites on Visin:\n- none');
  });

  it('says so, in words the model can act on, when a search or a read is refused', async () => {
    mocked.searchPaper.mockRejectedValue(new VisinError('This paper has not been read yet', 404));
    expect((await call('search_paper', { paper: 'p1', query: 'mIoU', limit: 3 })).isError).toBe(true);
    expect(mocked.searchPaper).toHaveBeenCalledWith('k', 'p1', 'mIoU', 3);
    mocked.readPaperPages.mockRejectedValue(new VisinError('That page is not in this paper', 404));
    expect((await call('read_paper_pages', { paper: 'p1', from: 99 })).isError).toBe(true);
  });

  it('names a result that is a project or a leaderboard by the tool that reads it, and one with no note plainly', async () => {
    mocked.getPaper.mockResolvedValue({
      ...paper(),
      paper: {
        ...paper().paper,
        results: [
          { kind: 'project', available: true, ref: 'road', name: 'Road' },
          { kind: 'leaderboard', available: true, ref: 'night@2', name: 'Night suite' },
          { kind: 'training', available: false }
        ]
      }
    });
    const { text } = await call('get_paper', { paper: 'p1' });
    expect(text).toContain(
      '- project “Road” — read the exact numbers with get_project or get_leaderboard with project "road"'
    );
    expect(text).toContain(
      '- leaderboard “Night suite” — read the exact numbers with get_leaderboard for the suite "night@2"'
    );
    expect(text).toContain('- a training that is no longer public');
  });
});
