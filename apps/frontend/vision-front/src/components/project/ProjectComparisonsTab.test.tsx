import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import ProjectComparisonsTab from './ProjectComparisonsTab';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

let authState: { isAuthenticated: boolean } = { isAuthenticated: true };
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../services/comparisonService', () => ({
  comparisonService: {
    getComparisons: vi.fn(),
    createComparison: vi.fn(),
    updateComparison: vi.fn(),
    deleteComparison: vi.fn(),
  },
}));
vi.mock('../../services/trainingService', () => ({
  trainingService: { getTrainings: vi.fn() },
}));
vi.mock('../../components/comparison/TrainingSelector', () => ({
  default: ({ onTrainingToggle }: { onTrainingToggle: (id: string) => void }) => (
    <button onClick={() => onTrainingToggle('t1')}>select-t1</button>
  ),
}));

import { comparisonService } from '../../services/comparisonService';
import { trainingService } from '../../services/trainingService';
const mockedComparison = vi.mocked(comparisonService);
const mockedTraining = vi.mocked(trainingService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const comparison = (overrides: Record<string, unknown> = {}) => ({
  _id: 'c1',
  uuid: 'uuid-c1',
  name: 'Comparison 1',
  type: 'trainings',
  itemIds: ['t1', 't2'],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  authState = { isAuthenticated: true };
  mockedComparison.getComparisons.mockResolvedValue({
    success: true,
    data: { comparisons: [], pagination: {} as never },
  } as never);
  mockedTraining.getTrainings.mockResolvedValue({
    success: true,
    data: { trainings: [], pagination: {} as never },
  } as never);
});

const renderTab = () => render(<ProjectComparisonsTab projectId="p1" />, { wrapper: makeWrapper() });

describe('ProjectComparisonsTab', () => {
  it('shows a spinner while loading', () => {
    renderTab();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderTab();
    await waitFor(() =>
      expect(screen.getByText('No comparisons found. Create your first comparison to get started.')).toBeInTheDocument()
    );
  });

  it('lists comparisons and navigates to the detail page on row click', async () => {
    mockedComparison.getComparisons.mockResolvedValue({
      success: true,
      data: { comparisons: [comparison()], pagination: {} as never },
    } as never);
    renderTab();

    await waitFor(() => expect(screen.getByText('Comparison 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Comparison 1'));

    expect(navigateMock).toHaveBeenCalledWith('/comparisons/uuid-c1');
  });

  it('hides "New Comparison" and row actions when not authenticated', async () => {
    authState = { isAuthenticated: false };
    mockedComparison.getComparisons.mockResolvedValue({
      success: true,
      data: { comparisons: [comparison()], pagination: {} as never },
    } as never);
    renderTab();

    await waitFor(() => expect(screen.getByText('Comparison 1')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /new comparison/i })).not.toBeInTheDocument();
  });

  it('creates a new comparison via the modal', async () => {
    mockedComparison.createComparison.mockResolvedValue({ success: true, data: comparison() } as never);
    renderTab();
    await waitFor(() => expect(screen.getByRole('button', { name: /new comparison/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /new comparison/i }));
    expect(screen.getByText('Create New Comparison')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Comparison Title'), { target: { value: 'My Comparison' } });
    fireEvent.click(screen.getByText('select-t1'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedComparison.createComparison).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Comparison', itemIds: ['t1'], projectId: 'p1' })
      )
    );
  });

  it('disables Save until a title and at least one item are selected', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByRole('button', { name: /new comparison/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /new comparison/i }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('opens the edit modal pre-filled and submits an update', async () => {
    mockedComparison.getComparisons.mockResolvedValue({
      success: true,
      data: { comparisons: [comparison()], pagination: {} as never },
    } as never);
    mockedComparison.updateComparison.mockResolvedValue({ success: true, data: comparison() } as never);
    renderTab();
    await waitFor(() => expect(screen.getByText('Comparison 1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit comparison/i }));
    expect(screen.getByDisplayValue('Comparison 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(mockedComparison.updateComparison).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Comparison 1' })));
  });

  it('deletes a comparison via the confirmation dialog', async () => {
    mockedComparison.getComparisons.mockResolvedValue({
      success: true,
      data: { comparisons: [comparison()], pagination: {} as never },
    } as never);
    mockedComparison.deleteComparison.mockResolvedValue({ success: true } as never);
    renderTab();
    await waitFor(() => expect(screen.getByText('Comparison 1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete comparison/i }));
    expect(screen.getByText(/Are you sure you want to delete "Comparison 1"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedComparison.deleteComparison).toHaveBeenCalledWith('c1'));
  });
});
