import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import FindingsPanel from './FindingsPanel';
import { Finding } from '../../types/finding';

const mockedService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  exportLatex: vi.fn()
}));
vi.mock('../../services/findingService', () => ({ findingService: mockedService }));

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  _id: 'f1',
  projectId: 'p1',
  title: 'Window ablation plateaus past 16',
  body: 'On ZOD, window16 beats window24 by 1.2 mAP. On WAYMO the order reverses.',
  trainingIds: ['t1', 't2'],
  citedTrainings: [
    { _id: 't1', name: 'window16 ablation', status: 'completed' },
    { _id: 't2', name: 'window24 ablation', status: 'completed' }
  ],
  authorKind: 'assistant',
  authorLabel: 'Claude',
  createdAt: '2026-09-05T10:00:00.000Z',
  ...overrides
});

const renderTab = (isOwner = true, trainingId?: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <FindingsPanel projectId="p1" trainingId={trainingId} isOwner={isOwner} />
      </QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedService.list.mockResolvedValue([finding()]);
  mockedService.create.mockResolvedValue(finding());
  mockedService.remove.mockResolvedValue(undefined);
  mockedService.exportLatex.mockResolvedValue({
    filename: 'window-ablation.tex',
    tex: '\\subsection{Window ablation}\n\\begin{table}[htbp]\n\\toprule'
  });
});

describe('reading recorded analysis', () => {
  it('shows the conclusion, its body and what it draws on', async () => {
    renderTab();

    expect(await screen.findByText('Window ablation plateaus past 16')).toBeInTheDocument();
    expect(screen.getByText(/window16 beats window24/)).toBeInTheDocument();
    expect(screen.getByText('Draws on 2 runs')).toBeInTheDocument();
  });

  it('names the runs it drew on, and links to each', async () => {
    // The gap this closes: the card said "draws on 2 runs" and stopped, so a
    // reader could not tell which two — the one thing a citation is for.
    renderTab();

    const window16 = await screen.findByRole('link', { name: 'window16 ablation' });
    expect(window16).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getByRole('link', { name: 'window24 ablation' })).toHaveAttribute(
      'href',
      '/trainings/t2'
    );
  });

  it('accounts for a cited run the reader cannot see rather than dropping it', async () => {
    // A finding may cite a run in a project this reader has no access to. The
    // name is withheld, but the count is not — a card quietly listing one of
    // two runs understates the evidence behind the conclusion.
    mockedService.list.mockResolvedValue([
      finding({
        trainingIds: ['t1', 'private'],
        citedTrainings: [{ _id: 't1', name: 'window16 ablation', status: 'completed' }]
      })
    ]);
    renderTab();

    expect(await screen.findByText('Draws on 2 runs')).toBeInTheDocument();
    expect(screen.getByText('1 not visible to you')).toBeInTheDocument();
  });

  it('falls back to the bare count when the API sends no names at all', async () => {
    // This front and vision-service deploy independently, so a front that ships
    // first talks briefly to an API with no citedTrainings. That degrades to the
    // old line; it must not crash the tab, and must not claim two private runs.
    mockedService.list.mockResolvedValue([finding({ citedTrainings: undefined })]);
    renderTab();

    expect(await screen.findByText('Draws on 2 runs')).toBeInTheDocument();
    expect(screen.queryByText(/not visible to you/)).not.toBeInTheDocument();
  });

  it('says whether a person or an assistant wrote it, rather than implying it', async () => {
    // A reader weighing a conclusion needs to know which it was.
    renderTab();

    expect(await screen.findByText('Claude')).toBeInTheDocument();
  });

  it('says "1 run" rather than "1 runs"', async () => {
    mockedService.list.mockResolvedValue([
      finding({ trainingIds: ['t1'], citedTrainings: [{ _id: 't1', name: 'w16', status: 'completed' }] })
    ]);
    renderTab();

    expect(await screen.findByText('Draws on 1 run')).toBeInTheDocument();
  });

  it('omits the citation line when nothing is cited', async () => {
    mockedService.list.mockResolvedValue([finding({ trainingIds: [] })]);
    renderTab();

    await screen.findByText('Window ablation plateaus past 16');
    expect(screen.queryByText(/Draws on/)).not.toBeInTheDocument();
  });

  it('shows a spinner while loading', () => {
    mockedService.list.mockReturnValue(new Promise(() => {}));
    renderTab();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('invites a first note when nothing is recorded', async () => {
    mockedService.list.mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText(/nothing recorded yet/i)).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    mockedService.list.mockRejectedValue(new Error('Forbidden'));
    renderTab();

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });
});

describe('writing one', () => {
  it('offers nothing to write with when the viewer is not the owner', async () => {
    // Findings are the owner's record, not a comment section on public work.
    mockedService.list.mockResolvedValue([finding()]);
    renderTab(false);

    await screen.findByText('Window ablation plateaus past 16');
    expect(screen.queryByRole('button', { name: /add note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('will not submit without both a conclusion and a body', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /add note/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/conclusion/i), { target: { value: 'T' } });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/what you found/i), { target: { value: 'B' } });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('records it against the project and closes', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /add note/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/conclusion/i), { target: { value: '  Title  ' } });
    fireEvent.change(within(dialog).getByLabelText(/what you found/i), { target: { value: ' Body ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      // Trimmed, so a stray space does not become part of the record.
      expect(mockedService.create).toHaveBeenCalledWith({
        project: 'p1',
        title: 'Title',
        body: 'Body'
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('forgets a draft that was cancelled', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /add note/i }));

    fireEvent.change(screen.getByLabelText(/conclusion/i), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    expect(await screen.findByLabelText(/conclusion/i)).toHaveValue('');
    expect(mockedService.create).not.toHaveBeenCalled();
  });

  it('surfaces a refusal to write', async () => {
    mockedService.create.mockRejectedValue(new Error('Only the project owner can record findings on it'));
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /add note/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/conclusion/i), { target: { value: 'T' } });
    fireEvent.change(within(dialog).getByLabelText(/what you found/i), { target: { value: 'B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Only the project owner/)).toBeInTheDocument();
  });
});

describe('deleting one', () => {
  it('removes it by id', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /delete window ablation/i }));

    await waitFor(() => expect(mockedService.remove).toHaveBeenCalledWith('f1'));
  });
});


/**
 * The same panel serves a project and a single run.
 *
 * Scoped to a run it lists findings *about* that run or citing it, because a
 * comparative conclusion drawn from a dozen runs is worth surfacing from any of
 * them — and anything written there is attributed to the run as well.
 */
describe('scoped to one run', () => {
  it('asks for findings by training rather than by project', async () => {
    renderTab(true, 't1');

    await waitFor(() => expect(mockedService.list).toHaveBeenCalledWith({ training: 't1' }));
  });

  it('attributes what it writes to the run as well as the project', async () => {
    renderTab(true, 't1');
    fireEvent.click(await screen.findByRole('button', { name: /add note/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/conclusion/i), { target: { value: 'T' } });
    fireEvent.change(within(dialog).getByLabelText(/what you found/i), { target: { value: 'B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedService.create).toHaveBeenCalledWith({
        project: 'p1',
        training: 't1',
        title: 'T',
        body: 'B'
      })
    );
  });

  it('says the listing includes comparative findings that merely cite the run', async () => {
    renderTab(true, 't1');

    expect(await screen.findByText(/comparative ones that cite it/i)).toBeInTheDocument();
  });

  it('words the empty state for a run rather than for a project', async () => {
    mockedService.list.mockResolvedValue([]);
    renderTab(true, 't1');

    expect(await screen.findByText(/nothing recorded about this run yet/i)).toBeInTheDocument();
  });
});

describe('exporting a finding as a paper section', () => {
  it('shows the generated LaTeX for copying rather than downloading a file', async () => {
    // What people do with this is paste it into a paper they already have
    // open; a file in ~/Downloads is a detour on the way there.
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Export Window ablation plateaus past 16 as LaTeX'
      })
    );

    expect(await screen.findByText(/\\subsection\{Window ablation\}/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('names the package the section needs, rather than letting it fail to compile', async () => {
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Export Window ablation plateaus past 16 as LaTeX'
      })
    );

    expect(await screen.findByText(/booktabs/)).toBeInTheDocument();
  });

  it('copies to the clipboard and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Export Window ablation plateaus past 16 as LaTeX'
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('subsection')));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('leaves the text on screen when the clipboard refuses', async () => {
    // Over plain HTTP, or with permission denied. The text is selectable, so
    // copying by hand still works and an error alert would be louder than the
    // problem.
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    });
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Export Window ablation plateaus past 16 as LaTeX'
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(/\\subsection\{Window ablation\}/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a failed export instead of opening an empty dialog', async () => {
    mockedService.exportLatex.mockRejectedValue(new Error('Finding not found'));
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Export Window ablation plateaus past 16 as LaTeX'
      })
    );

    expect(await screen.findByText('Finding not found')).toBeInTheDocument();
  });
});

describe('what to run next', () => {
  it('shows the recommendation apart from the analysis', async () => {
    // Two different readers: the body can go into a paper, this is a note to
    // whoever launches the next run.
    mockedService.list.mockResolvedValue([
      finding({ recommendations: 'Drop window24. Add early stopping at epoch 30.' })
    ]);
    renderTab();

    expect(await screen.findByText('SUGGESTED NEXT RUN')).toBeInTheDocument();
    expect(screen.getByText(/Drop window24/)).toBeInTheDocument();
  });

  it('shows no such block when nothing was suggested', async () => {
    renderTab();

    await screen.findByText('Window ablation plateaus past 16');
    expect(screen.queryByText('SUGGESTED NEXT RUN')).not.toBeInTheDocument();
  });

  it('sends a written recommendation along with the note', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Add note/ }));
    fireEvent.change(screen.getByLabelText(/Conclusion/), { target: { value: 'T' } });
    fireEvent.change(screen.getByLabelText(/What you found/), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText(/Suggested next run/), {
      target: { value: 'Try window8.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedService.create).toHaveBeenCalledWith(
        expect.objectContaining({ recommendations: 'Try window8.' })
      )
    );
  });
});
