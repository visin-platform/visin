import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import ProjectVisualizationsTab from './ProjectVisualizationsTab';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../../services/comparisonService', () => ({
  comparisonService: { createComparison: vi.fn() },
}));
vi.mock('../../services/visualizationService', () => ({
  visualizationService: { getVisualizationsByTraining: vi.fn() },
}));

import { comparisonService } from '../../services/comparisonService';
import { visualizationService } from '../../services/visualizationService';
const mockedComparison = vi.mocked(comparisonService);
const mockedViz = vi.mocked(visualizationService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const frame = (id: string, type: string, epoch = 3) => ({
  _id: id,
  type,
  epoch,
  signedUrl: `https://files.example.test/${id}.png`,
});
const run = (overrides: Record<string, unknown> = {}) => ({
  training_id: 'id1',
  training_uuid: 't1',
  training_name: 'Run 1',
  visualizations: [frame('v1', 'overlay'), frame('v2', 'mask', 5)],
  visualization_count: 2,
  type_counts: { overlay: 1, mask: 1 },
  ...overrides,
});
const respond = (...trainings: unknown[]) =>
  mockedViz.getVisualizationsByTraining.mockResolvedValue({
    success: true,
    data: { trainings, total: trainings.length },
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  respond();
});

const renderTab = () => render(<ProjectVisualizationsTab projectId="p1" />, { wrapper: makeWrapper() });

describe('ProjectVisualizationsTab', () => {
  it('shows a spinner while loading', () => {
    mockedViz.getVisualizationsByTraining.mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(screen.getByRole('status', { name: 'Loading visualizations' })).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderTab();
    expect(await screen.findByText(/^No visualizations yet\./)).toBeInTheDocument();
  });

  it('asks for a few frames of each run, with their addresses', async () => {
    renderTab();
    await screen.findByText(/^No visualizations yet\./);
    expect(mockedViz.getVisualizationsByTraining).toHaveBeenCalledWith('', {
      projectId: 'p1',
      includeUrls: true,
      perTraining: 4,
      limit: 12,
      page: 1,
    });
  });

  it('shows each run\'s frames under its name, as a link to the run\'s visualizations', async () => {
    respond(run());
    renderTab();

    expect(await screen.findByRole('link', { name: 'Run 1' })).toHaveAttribute('href', '/trainings/id1?tab=visualizations');
    expect(screen.getByText('2 visualizations')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'overlay · epoch 3' })).toHaveAttribute('src', 'https://files.example.test/v1.png');
    expect(screen.getByRole('img', { name: 'mask · epoch 5' })).toBeInTheDocument();
  });

  it('singularizes the count for exactly one', async () => {
    respond(run({ visualizations: [frame('v1', 'overlay')], visualization_count: 1, type_counts: { overlay: 1 } }));
    renderTab();

    expect(await screen.findByText('1 visualization')).toBeInTheDocument();
  });

  it('says how many more a run has than it shows', async () => {
    respond(run({ visualization_count: 9, type_counts: { overlay: 9 } }));
    renderTab();

    expect(await screen.findByText('Showing the newest 2 of 9.')).toBeInTheDocument();
  });

  it('offers the types there are, and asks for one when it is picked', async () => {
    respond(run(), run({ training_uuid: 't2', training_id: 'id2', training_name: 'Run 2', type_counts: { overlay: 4 } }));
    renderTab();

    expect(await screen.findByRole('button', { name: 'All (6)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'overlay (5)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mask (1)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'mask (1)' }));

    await waitFor(() =>
      expect(mockedViz.getVisualizationsByTraining).toHaveBeenLastCalledWith('', {
        projectId: 'p1',
        includeUrls: true,
        perTraining: 4,
        limit: 12,
        page: 1,
        type: 'mask',
      })
    );
    expect(screen.getByRole('button', { name: 'mask (1)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves out a run with nothing of the type showing', async () => {
    respond(run(), run({ training_uuid: 't2', training_id: 'id2', training_name: 'Empty run', visualizations: [], visualization_count: 0, type_counts: {} }));
    renderTab();

    expect(await screen.findByRole('link', { name: 'Run 1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Empty run' })).not.toBeInTheDocument();
  });

  it('selects a run and creates a comparison from the checkbox', async () => {
    mockedComparison.createComparison.mockResolvedValue({ success: true, data: { uuid: 'cmp-1' } } as never);
    respond(run());
    renderTab();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Run 1' }));
    fireEvent.click(screen.getByRole('button', { name: /compare selected \(1\)/i }));

    await waitFor(() =>
      expect(mockedComparison.createComparison).toHaveBeenCalledWith(
        expect.objectContaining({ itemIds: ['id1'], projectId: 'p1' })
      )
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/comparisons/cmp-1'));
  });

  it('deselecting a run hides the compare button', async () => {
    respond(run());
    renderTab();

    const box = await screen.findByRole('checkbox', { name: 'Select Run 1' });
    fireEvent.click(box);
    expect(screen.getByRole('button', { name: /compare selected/i })).toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.queryByRole('button', { name: /compare selected/i })).not.toBeInTheDocument();
  });

  it('says so when the frames cannot be loaded', async () => {
    mockedViz.getVisualizationsByTraining.mockRejectedValue(new Error('down'));
    renderTab();

    expect(await screen.findByText('Could not load the visualizations.')).toBeInTheDocument();
  });

  it('takes the runs a page at a time, and shows older ones on request', async () => {
    mockedViz.getVisualizationsByTraining
      .mockResolvedValueOnce({
        success: true,
        data: { trainings: [run()], total: 2, pagination: { page: 1, limit: 12, total: 13, pages: 2 } },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: {
          trainings: [run({ training_uuid: 't2', training_id: 'id2', training_name: 'Old run' })],
          total: 2,
          pagination: { page: 2, limit: 12, total: 13, pages: 2 },
        },
      } as never);
    renderTab();

    await screen.findByRole('link', { name: 'Run 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Show older runs' }));

    expect(await screen.findByRole('link', { name: 'Old run' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Run 1' })).toBeInTheDocument();
    expect(mockedViz.getVisualizationsByTraining).toHaveBeenLastCalledWith('', expect.objectContaining({ page: 2 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show older runs' })).not.toBeInTheDocument());
  });

  it('says the newest runs rendered nothing, rather than that there is nothing, while older runs remain', async () => {
    mockedViz.getVisualizationsByTraining.mockResolvedValue({
      success: true,
      data: { trainings: [], total: 0, pagination: { page: 1, limit: 12, total: 30, pages: 3 } },
    } as never);
    renderTab();

    expect(await screen.findByText('None of the newest runs rendered frames.')).toBeInTheDocument();
    expect(screen.queryByText(/^No visualizations yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show older runs' })).toBeInTheDocument();
  });
});
