import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FindingsPanel from './FindingsPanel';
import { Finding } from '../../types/finding';

const mockedService = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock('../../services/findingService', () => ({ findingService: mockedService }));

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  _id: 'f1',
  projectId: 'p1',
  title: 'Window ablation plateaus past 16',
  body: 'On ZOD, window16 beats window24 by 1.2 mAP. On WAYMO the order reverses.',
  trainingIds: ['t1', 't2'],
  authorKind: 'assistant',
  authorLabel: 'Claude',
  createdAt: '2026-09-05T10:00:00.000Z',
  ...overrides
});

const renderTab = (isOwner = true, trainingId?: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FindingsPanel projectId="p1" trainingId={trainingId} isOwner={isOwner} />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedService.list.mockResolvedValue([finding()]);
  mockedService.create.mockResolvedValue(finding());
  mockedService.remove.mockResolvedValue(undefined);
});

describe('reading recorded analysis', () => {
  it('shows the conclusion, its body and what it draws on', async () => {
    renderTab();

    expect(await screen.findByText('Window ablation plateaus past 16')).toBeInTheDocument();
    expect(screen.getByText(/window16 beats window24/)).toBeInTheDocument();
    expect(screen.getByText('Draws on 2 runs')).toBeInTheDocument();
  });

  it('says whether a person or an assistant wrote it, rather than implying it', async () => {
    // A reader weighing a conclusion needs to know which it was.
    renderTab();

    expect(await screen.findByText('Claude')).toBeInTheDocument();
  });

  it('says "1 run" rather than "1 runs"', async () => {
    mockedService.list.mockResolvedValue([finding({ trainingIds: ['t1'] })]);
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
