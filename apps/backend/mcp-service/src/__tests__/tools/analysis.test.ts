jest.mock('../../vision', () => ({
  vision: { listFindings: jest.fn(), getFinding: jest.fn(), createFinding: jest.fn() }
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vision } from '../../vision';
import { VisinError } from '../../http';
import { analysisRead, analysisWrite } from '../../tools/analysis';

const mocked = vision as unknown as Record<string, jest.Mock>;

type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const found: Record<string, Handler> = {};
  const server = {
    registerTool: (n: string, _c: unknown, h: Handler) => {
      found[n] = h;
    }
  } as unknown as McpServer;
  analysisRead.register(server, { token: 'k' });
  analysisWrite.register(server, { token: 'k' });

  const result = await found[name](args);
  return { text: result.content[0].text, isError: result.isError === true };
};

const finding = (over: Record<string, unknown> = {}) => ({
  _id: 'f1',
  projectId: 'p1',
  title: 'Window ablation plateaus past 16',
  body: 'On ZOD, window16 beats window24 by 1.2 mAP. On WAYMO the order reverses.',
  trainingIds: ['t1', 't2'],
  authorKind: 'assistant',
  authorLabel: 'Claude',
  createdAt: '2026-09-05T10:00:00.000Z',
  ...over
});

beforeEach(() => jest.clearAllMocks());

describe('list_findings', () => {
  it('names each conclusion, who wrote it and how much it draws on', async () => {
    mocked.listFindings.mockResolvedValue([finding()]);

    const { text } = await call('list_findings', { project: 'clftv2' });

    expect(text).toContain('Window ablation plateaus past 16 — Claude, 2026-09-05, cites 2 runs  [f1]');
    expect(text).toContain('get_finding');
  });

  it('omits the citation count when there is nothing cited', async () => {
    mocked.listFindings.mockResolvedValue([finding({ trainingIds: [] })]);

    expect((await call('list_findings')).text).not.toContain('cites');
  });

  it('passes the filters and a default limit', async () => {
    mocked.listFindings.mockResolvedValue([]);

    await call('list_findings', { project: 'clftv2', training: 't1' });

    expect(mocked.listFindings).toHaveBeenCalledWith('k', {
      project: 'clftv2',
      training: 't1',
      limit: 20
    });
  });

  it('says plainly when nothing has been recorded', async () => {
    mocked.listFindings.mockResolvedValue([]);

    expect((await call('list_findings')).text).toBe('Nothing has been recorded yet for that.');
  });

  it('caps a long list', async () => {
    mocked.listFindings.mockResolvedValue(
      Array.from({ length: 70 }, (_, i) => finding({ _id: `f${i}` }))
    );

    expect((await call('list_findings')).text).toContain('first 50 of 70 findings');
  });
});

describe('get_finding', () => {
  it('reads one in full, with the runs it draws on', async () => {
    mocked.getFinding.mockResolvedValue(finding());

    const { text } = await call('get_finding', { finding: 'f1' });

    expect(text).toContain('Window ablation plateaus past 16');
    expect(text).toContain('Claude · 2026-09-05');
    expect(text).toContain('window16 beats window24');
    expect(text).toContain('Draws on: t1, t2');
  });

  it('leaves the citation line off when there is none', async () => {
    mocked.getFinding.mockResolvedValue(finding({ trainingIds: [] }));

    expect((await call('get_finding', { finding: 'f1' })).text).not.toContain('Draws on');
  });

  it('explains a finding that is not visible', async () => {
    mocked.getFinding.mockRejectedValue(new VisinError('Finding not found', 404));

    const { text, isError } = await call('get_finding', { finding: 'nope' });

    expect(isError).toBe(true);
    expect(text).toContain('private project');
  });
});

describe('record_finding', () => {
  it('writes it and says where it can be read back', async () => {
    mocked.createFinding.mockResolvedValue(finding());

    const { text } = await call('record_finding', {
      project: 'clftv2',
      title: 'Window ablation plateaus past 16',
      body: 'evidence',
      trainingIds: ['t1', 't2']
    });

    expect(mocked.createFinding).toHaveBeenCalledWith('k', {
      project: 'clftv2',
      title: 'Window ablation plateaus past 16',
      body: 'evidence',
      training: undefined,
      trainingIds: ['t1', 't2']
    });
    expect(text).toContain('visible in the app');
    expect(text).toContain('[f1]');
  });

  it('tells the model not to retry when the scope is missing', async () => {
    // A read-only analysis grant cannot write; the fix is a new grant.
    mocked.createFinding.mockRejectedValue(
      new VisinError('This credential does not carry the "analysis:write" scope.', 403)
    );

    const { text, isError } = await call('record_finding', {
      project: 'clftv2',
      title: 'T',
      body: 'B'
    });

    expect(isError).toBe(true);
    expect(text).toContain('Do not retry');
  });

  it('surfaces a refusal to annotate a project the caller does not own', async () => {
    mocked.createFinding.mockRejectedValue(
      new VisinError('Only the project owner can record findings on it', 403)
    );

    expect((await call('record_finding', { project: 'p', title: 'T', body: 'B' })).text).toContain(
      'Only the project owner'
    );
  });
});
