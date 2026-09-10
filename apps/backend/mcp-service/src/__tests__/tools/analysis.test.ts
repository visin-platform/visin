jest.mock('../../vision', () => ({
  vision: {
    listFindings: jest.fn(),
    getFinding: jest.fn(),
    createFinding: jest.fn(),
    exportFinding: jest.fn()
  }
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
  // Always an array by the time a tool sees it — `findingSchema` defaults it —
  // so a fixture without one would be a mock the real code cannot receive.
  citedTrainings: [
    { _id: 't1', name: 'window16 ablation', status: 'completed' },
    { _id: 't2', name: 'window24 ablation', status: 'completed' }
  ],
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

    expect(text).toContain(
      'Window ablation plateaus past 16 — Claude, 2026-09-05, cites window16 ablation, ' +
        'window24 ablation  [f1]'
    );
    expect(text).toContain('get_finding');
  });

  it('omits the citation count when there is nothing cited', async () => {
    mocked.listFindings.mockResolvedValue([finding({ trainingIds: [], citedTrainings: [] })]);

    expect((await call('list_findings')).text).not.toContain('cites');
  });

  it('falls back to a count when the API named none of them', async () => {
    // vision-service and this service deploy separately, so a listing from an
    // API that predates the names must still render — as the old count, not as
    // a crash or a claim that every run is private.
    mocked.listFindings.mockResolvedValue([finding({ citedTrainings: [] })]);

    const { text } = await call('list_findings');

    expect(text).toContain('cites 2 runs');
    expect(text).not.toContain('not visible');
  });

  it('says how many cited runs this key cannot see', async () => {
    // The conclusion rests on more evidence than is being shown, and a listing
    // that just showed one run would understate it.
    mocked.listFindings.mockResolvedValue([
      finding({
        trainingIds: ['t1', 'private'],
        citedTrainings: [{ _id: 't1', name: 'window16 ablation', status: 'completed' }]
      })
    ]);

    expect((await call('list_findings')).text).toContain(
      'cites window16 ablation, 1 not visible to this key'
    );
  });

  it('caps the names on one line for a finding citing dozens of runs', async () => {
    mocked.listFindings.mockResolvedValue([
      finding({
        trainingIds: Array.from({ length: 9 }, (_, i) => `t${i}`),
        citedTrainings: Array.from({ length: 9 }, (_, i) => ({
          _id: `t${i}`,
          name: `run ${i}`,
          status: 'completed'
        }))
      })
    ]);

    const { text } = await call('list_findings');

    expect(text).toContain('cites run 0, run 1, run 2, run 3, run 4, run 5 +3 more');
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
    expect(text).toContain('Draws on: window16 ablation [t1], window24 ablation [t2]');
  });

  it('keeps the raw ids when the API named none of them', async () => {
    // Degraded, but still the id a follow-up tool call needs.
    mocked.getFinding.mockResolvedValue(finding({ citedTrainings: [] }));

    expect((await call('get_finding', { finding: 'f1' })).text).toContain(
      'Draws on 2 run(s): t1, t2'
    );
  });

  it('accounts for a cited run this key cannot see', async () => {
    mocked.getFinding.mockResolvedValue(
      finding({
        trainingIds: ['t1', 'private'],
        citedTrainings: [{ _id: 't1', name: 'window16 ablation', status: 'completed' }]
      })
    );

    expect((await call('get_finding', { finding: 'f1' })).text).toContain(
      'Draws on: window16 ablation [t1] (and 1 run(s) in a project this key cannot see)'
    );
  });

  it('leaves the citation line off when there is none', async () => {
    mocked.getFinding.mockResolvedValue(finding({ trainingIds: [], citedTrainings: [] }));

    expect((await call('get_finding', { finding: 'f1' })).text).not.toContain('Draws on');
  });

  it('explains a finding that is not visible', async () => {
    mocked.getFinding.mockRejectedValue(new VisinError('Finding not found', 404));

    const { text, isError } = await call('get_finding', { finding: 'nope' });

    expect(isError).toBe(true);
    expect(text).toContain('private project');
  });
});

describe('exporting a finding as a paper section', () => {
  it('hands back generated LaTeX rather than asking the model to write it', async () => {
    // The reason the export is server-side: a model writing a results table
    // retypes numbers it read earlier in the conversation, and a slipped digit
    // becomes a wrong figure in a published paper.
    mocked.exportFinding.mockResolvedValue({
      filename: 'window-ablation.tex',
      tex: '\\subsection{Window ablation}\n\\begin{table}[htbp]'
    });

    const { text } = await call('get_finding', {
      finding: 'f1',
      format: 'latex',
      selectBy: 'val.mean_iou',
      direction: 'max',
      metrics: ['val.mean_iou', 'val.loss']
    });

    expect(mocked.exportFinding).toHaveBeenCalledWith('k', 'f1', {
      selectBy: 'val.mean_iou',
      direction: 'max',
      metrics: 'val.mean_iou,val.loss'
    });
    expect(text).toContain('window-ablation.tex');
    expect(text).toContain('\\subsection{Window ablation}');
    expect(text).toContain('not transcribed');
    expect(mocked.getFinding).not.toHaveBeenCalled();
  });

  it('reads the finding normally when no format is asked for', async () => {
    mocked.getFinding.mockResolvedValue(finding());

    await call('get_finding', { finding: 'f1' });

    expect(mocked.exportFinding).not.toHaveBeenCalled();
  });

  it('shows what to run next, kept apart from the analysis itself', async () => {
    mocked.getFinding.mockResolvedValue(
      finding({ recommendations: 'Drop window24. Add early stopping at epoch 30.' })
    );

    const { text } = await call('get_finding', { finding: 'f1' });

    expect(text).toContain('Suggested next run:');
    expect(text).toContain('Drop window24.');
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
      recommendations: undefined,
      training: undefined,
      trainingIds: ['t1', 't2']
    });
    expect(text).toContain('visible in the app');
    expect(text).toContain('[f1]');
  });

  it('records what to change next as its own field, not buried in the analysis', async () => {
    // Separate because the two have different readers: the body can go into a
    // paper, the recommendation is a note to whoever launches the next run.
    mocked.createFinding.mockResolvedValue(finding());

    await call('record_finding', {
      project: 'clftv2',
      title: 'T',
      body: 'B',
      recommendations: 'Drop window24 from the sweep.'
    });

    expect(mocked.createFinding).toHaveBeenCalledWith(
      'k',
      expect.objectContaining({ recommendations: 'Drop window24 from the sweep.' })
    );
  });

  it('points at the export, so the analysis gets used rather than retyped', async () => {
    mocked.createFinding.mockResolvedValue(finding());

    expect(
      (await call('record_finding', { project: 'p', title: 'T', body: 'B' })).text
    ).toContain('get_finding(format:"latex")');
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

describe('continuing finding pages', () => {
  const before = '2026-09-05T10:00:00.000Z_507f1f77bcf86cd799439011';

  it('supplies a continuation cursor and forwards it on the next request', async () => {
    mocked.listFindings.mockResolvedValueOnce([finding({ _id: '507f1f77bcf86cd799439011' })]);
    expect((await call('list_findings', { limit: 1 })).text).toContain(`before="${before}"`);
    mocked.listFindings.mockResolvedValueOnce([]);
    expect((await call('list_findings', { limit: 1, before })).text).toBe('No more findings.');
    expect(mocked.listFindings).toHaveBeenLastCalledWith('k', { project: undefined, training: undefined, limit: 1, before });
  });
});
