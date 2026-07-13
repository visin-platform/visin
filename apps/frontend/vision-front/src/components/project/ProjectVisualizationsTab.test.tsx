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

import { comparisonService } from '../../services/comparisonService';
const mockedComparison = vi.mocked(comparisonService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const baseProps = {
  projectId: 'p1',
  visualizationsResponse: { data: { trainings: [] } },
  isLoading: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

const renderTab = (props = {}) =>
  render(<ProjectVisualizationsTab {...baseProps} {...props} />, { wrapper: makeWrapper() });

describe('ProjectVisualizationsTab', () => {
  it('shows a spinner while loading', () => {
    renderTab({ isLoading: true });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    renderTab();
    expect(screen.getByText('No visualizations found for this project.')).toBeInTheDocument();
  });

  it('renders a training card with visualization type counts', () => {
    const training = {
      training_uuid: 't1',
      training_name: 'Run 1',
      visualizations: [{ type: 'loss' }, { type: 'loss' }, { type: 'confusion' }],
    };
    renderTab({ visualizationsResponse: { data: { trainings: [training] } } });

    expect(screen.getByText('Run 1')).toBeInTheDocument();
    expect(screen.getByText('3 visualizations')).toBeInTheDocument();
    expect(screen.getByText('loss: 2')).toBeInTheDocument();
    expect(screen.getByText('confusion: 1')).toBeInTheDocument();
  });

  it('singularizes the count label for exactly one visualization', () => {
    const training = { training_uuid: 't1', training_name: 'Run 1', visualizations: [{ type: 'loss' }] };
    renderTab({ visualizationsResponse: { data: { trainings: [training] } } });

    expect(screen.getByText('1 visualization')).toBeInTheDocument();
  });

  it('shows a per-training empty message when it has no visualizations', () => {
    const training = { training_uuid: 't1', training_name: 'Run 1', visualizations: [] };
    renderTab({ visualizationsResponse: { data: { trainings: [training] } } });

    expect(screen.getByText('No visualizations for this training.')).toBeInTheDocument();
  });

  it('selects a training and creates a comparison from the checkbox', async () => {
    mockedComparison.createComparison.mockResolvedValue({ success: true, data: { uuid: 'cmp-1' } } as never);
    const training = { training_uuid: 't1', training_name: 'Run 1', visualizations: [{ type: 'loss' }] };
    renderTab({ visualizationsResponse: { data: { trainings: [training] } } });

    fireEvent.click(screen.getByRole('checkbox'));
    const compareButton = screen.getByRole('button', { name: /compare selected \(1\)/i });
    fireEvent.click(compareButton);

    await waitFor(() =>
      expect(mockedComparison.createComparison).toHaveBeenCalledWith(
        expect.objectContaining({ itemIds: ['t1'], projectId: 'p1' })
      )
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/comparisons/cmp-1'));
  });

  it('deselecting a training hides the compare button', () => {
    const training = { training_uuid: 't1', training_name: 'Run 1', visualizations: [] };
    renderTab({ visualizationsResponse: { data: { trainings: [training] } } });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: /compare selected/i })).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(screen.queryByRole('button', { name: /compare selected/i })).not.toBeInTheDocument();
  });
});
