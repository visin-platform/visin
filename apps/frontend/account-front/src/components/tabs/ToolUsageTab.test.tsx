import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToolUsageTab from './ToolUsageTab';

const mockedService = vi.hoisted(() => ({ summary: vi.fn(), recent: vi.fn() }));
vi.mock('../../services/toolUsageService', () => ({ toolUsageService: mockedService }));

const usage = [
  { tool: 'get_training_curve', calls: 2, failed: 0, totalTokens: 9000, avgTokens: 4500, avgMs: 1400, maxTokens: 6000 },
  { tool: 'list_projects', calls: 100, failed: 3, totalTokens: 1200, avgTokens: 12, avgMs: 40, maxTokens: 20 }
];

const calls = [
  { at: '2026-09-05T12:00:00.000Z', tool: 'list_projects', ms: 90, tokens: 157, failed: false, actorLabel: 'Claude', actorKind: 'oauth' as const },
  { at: '2026-09-05T11:00:00.000Z', tool: 'get_test_results', ms: 2800, tokens: 86, failed: true, actorLabel: 'CI key', actorKind: 'api_key' as const }
];

const renderTab = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToolUsageTab />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedService.summary.mockResolvedValue({ windowDays: 30, usage });
  mockedService.recent.mockResolvedValue(calls);
});

describe('the summary', () => {
  it('ranks by total tokens, not call count', async () => {
    // The whole point: a tool called twice returning an epoch series costs more
    // than a hundred cheap lookups, and the two order differently.
    renderTab();
    await screen.findByText('get_training_curve');

    const rows = screen.getAllByRole('row').map(r => r.textContent ?? '');
    const curve = rows.findIndex(t => t.includes('get_training_curve'));
    const projects = rows.findIndex(t => t.includes('list_projects'));

    expect(curve).toBeLessThan(projects);
  });

  it('shows the totals a person is deciding from', async () => {
    renderTab();

    const row = (await screen.findByText('get_training_curve')).closest('tr')!;
    expect(within(row).getByText('9,000')).toBeInTheDocument();
    expect(within(row).getByText('4,500')).toBeInTheDocument();
    expect(within(row).getByText('1.4s')).toBeInTheDocument();
  });

  it('reports the window and its totals', async () => {
    renderTab();

    expect(await screen.findByText(/102 calls, about 10,200 tokens over 30 days/)).toBeInTheDocument();
  });

  it('refetches when the window changes', async () => {
    renderTab();
    await screen.findByText('get_training_curve');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /window/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'Last 7 days' }));

    await waitFor(() => expect(mockedService.summary).toHaveBeenCalledWith(7));
  });

  it('flags failures but shows a dash when there are none', async () => {
    renderTab();

    // The tool appears in both tables; the summary renders it in a <p>.
    const failing = (await screen.findByText('list_projects', { selector: 'p' })).closest('tr')!;
    expect(within(failing).getByText('3')).toBeInTheDocument();
    const clean = screen.getByText('get_training_curve').closest('tr')!;
    expect(within(clean).getByText('—')).toBeInTheDocument();
  });

  it('says the token figure is an estimate, not a bill', async () => {
    renderTab();

    expect(await screen.findByText(/not a billing figure/i)).toBeInTheDocument();
  });

  it('draws no bar when every tool cost nothing, rather than dividing by zero', async () => {
    mockedService.summary.mockResolvedValue({
      windowDays: 30,
      usage: [{ tool: 'list_projects', calls: 1, failed: 0, totalTokens: 0, avgTokens: 0, avgMs: 5, maxTokens: 0 }]
    });
    renderTab();

    await screen.findByText('list_projects', { selector: 'p' });
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '0');
  });

  it('invites a first connection when the window is empty', async () => {
    mockedService.summary.mockResolvedValue({ windowDays: 30, usage: [] });
    renderTab();

    expect(await screen.findByText(/no tool calls in this window/i)).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    mockedService.summary.mockRejectedValue(new Error('Not authenticated'));
    renderTab();

    expect(await screen.findByText('Not authenticated')).toBeInTheDocument();
  });
});

describe('recent calls', () => {
  it('names the tool, who called it and what it cost', async () => {
    renderTab();

    const row = (await screen.findByText('get_test_results')).closest('tr')!;
    expect(within(row).getByText(/CI key/)).toBeInTheDocument();
    expect(within(row).getByText(/API key/)).toBeInTheDocument();
    expect(within(row).getByText('2.8s')).toBeInTheDocument();
  });

  it('distinguishes a connected app from a pasted key', async () => {
    renderTab();

    const row = (await screen.findByText('list_projects', { selector: 'td' })).closest('tr')!;
    expect(within(row).getByText(/connected app/)).toBeInTheDocument();
  });

  it('marks a failed call', async () => {
    renderTab();

    const row = (await screen.findByText('get_test_results')).closest('tr')!;
    expect(within(row).getByText('failed')).toBeInTheDocument();
  });

  it('surfaces a failure to load the trail separately from the summary', async () => {
    // The two panels load independently; one failing must not blank the other.
    mockedService.recent.mockRejectedValue(new Error('Trail unavailable'));
    renderTab();

    expect(await screen.findByText('Trail unavailable')).toBeInTheDocument();
    expect(screen.getByText('get_training_curve')).toBeInTheDocument();
  });

  it('says so when nothing is recorded yet', async () => {
    mockedService.recent.mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText(/nothing recorded yet/i)).toBeInTheDocument();
  });
});
