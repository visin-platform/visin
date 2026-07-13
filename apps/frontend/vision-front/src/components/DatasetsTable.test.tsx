import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisTable } from './DatasetsTable';
import { getAllAnalyses, deleteAnalysis, updateAnalysis, DatasetAnalysis } from '../services/analysisService';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../services/analysisService', () => ({
  getAllAnalyses: vi.fn(),
  deleteAnalysis: vi.fn(),
  updateAnalysis: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('../hooks/useDatasetDownload', () => ({
  useDatasetDownload: () => ({ downloadingId: null, download: vi.fn() })
}));

const mockedGetAllAnalyses = vi.mocked(getAllAnalyses);
const mockedDeleteAnalysis = vi.mocked(deleteAnalysis);
const mockedUpdateAnalysis = vi.mocked(updateAnalysis);
const mockedUseAuth = vi.mocked(useAuth);

const analysis1: DatasetAnalysis = {
  _id: 'a1',
  dataset: 'Dataset Alpha',
  size: '2.3 GB',
  data: {},
  downloadUrl: 'https://example.com/download',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z'
};

const analysis2: DatasetAnalysis = {
  _id: 'a2',
  dataset: 'Dataset Beta',
  data: {},
  createdAt: '2026-01-03T10:00:00.000Z',
  updatedAt: '2026-01-04T10:00:00.000Z'
};

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderTable = (props: Partial<React.ComponentProps<typeof AnalysisTable>> = {}) => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AnalysisTable {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('AnalysisTable (DatasetsTable)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { groups: ['owner'] }
    } as any);
  });

  it('shows a loading spinner while analyses are loading', () => {
    mockedGetAllAnalyses.mockReturnValue(new Promise(() => {}) as any);
    const { container } = renderTable();
    expect(container.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });

  it('renders "No analyses found" when the list is empty', async () => {
    mockedGetAllAnalyses.mockResolvedValue({ data: [], pagination: { total: 0, limit: 100, skip: 0 } } as any);
    renderTable();
    await waitFor(() => {
      expect(screen.getByText('No analyses found')).toBeInTheDocument();
    });
  });

  it('renders analysis rows sorted by createdAt desc by default', async () => {
    mockedGetAllAnalyses.mockResolvedValue({
      data: [analysis1, analysis2],
      pagination: { total: 2, limit: 100, skip: 0 }
    } as any);
    renderTable();

    await waitFor(() => {
      expect(screen.getByText('Dataset Alpha')).toBeInTheDocument();
    });
    expect(screen.getByText('Dataset Beta')).toBeInTheDocument();

    const rows = screen.getAllByRole('row').slice(1); // skip header row
    // analysis2 has a later createdAt, so with desc sort it should appear first
    expect(rows[0]).toHaveTextContent('Dataset Beta');
  });

  it('shows a load error message when fetching fails', async () => {
    mockedGetAllAnalyses.mockRejectedValue(new Error('boom'));
    renderTable();
    await waitFor(() => {
      expect(screen.getByText('Failed to load analyses')).toBeInTheDocument();
    });
  });

  it('re-sorts when clicking the Dataset column header', async () => {
    mockedGetAllAnalyses.mockResolvedValue({
      data: [analysis1, analysis2],
      pagination: { total: 2, limit: 100, skip: 0 }
    } as any);
    renderTable();

    await waitFor(() => {
      expect(screen.getByText('Dataset Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dataset'));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Dataset Alpha');
  });

  it('shows the compare button and calls onCompareSelected when multiple are selected', async () => {
    mockedGetAllAnalyses.mockResolvedValue({
      data: [analysis1, analysis2],
      pagination: { total: 2, limit: 100, skip: 0 }
    } as any);
    const onCompareSelected = vi.fn();
    renderTable({
      selectedAnalysisIds: new Set(['a1', 'a2']),
      onCompareSelected
    });

    await waitFor(() => {
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });
    const compareButtons = screen.getAllByRole('button', { name: /compare/i });
    fireEvent.click(compareButtons[0]);
    expect(onCompareSelected).toHaveBeenCalled();
  });

  it('opens the edit dialog, edits and confirms an update', async () => {
    mockedGetAllAnalyses.mockResolvedValue({
      data: [analysis1],
      pagination: { total: 1, limit: 100, skip: 0 }
    } as any);
    mockedUpdateAnalysis.mockResolvedValue(analysis1 as any);
    renderTable();

    await waitFor(() => {
      expect(screen.getByText('Dataset Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /edit dataset/i }));
    expect(screen.getByText('Edit Dataset Name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() => {
      expect(mockedUpdateAnalysis).toHaveBeenCalledWith('a1', expect.objectContaining({ dataset: 'Dataset Alpha' }));
    });
  });

  it('opens the delete dialog and confirms deletion', async () => {
    mockedGetAllAnalyses.mockResolvedValue({
      data: [analysis1],
      pagination: { total: 1, limit: 100, skip: 0 }
    } as any);
    mockedDeleteAnalysis.mockResolvedValue(undefined as any);
    renderTable();

    await waitFor(() => {
      expect(screen.getByText('Dataset Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete analysis/i }));
    expect(screen.getByText('Delete Analysis')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockedDeleteAnalysis).toHaveBeenCalledWith('a1');
    });
  });

  it('hides edit/delete actions when the user is not authenticated', async () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null } as any);
    mockedGetAllAnalyses.mockResolvedValue({
      data: [analysis1],
      pagination: { total: 1, limit: 100, skip: 0 }
    } as any);
    renderTable();

    await waitFor(() => {
      expect(screen.getByText('Dataset Alpha')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /edit dataset/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete analysis/i })).not.toBeInTheDocument();
  });

  it('selects all rows via the header checkbox', async () => {
    mockedGetAllAnalyses.mockResolvedValue({
      data: [analysis1, analysis2],
      pagination: { total: 2, limit: 100, skip: 0 }
    } as any);
    const onSelectAll = vi.fn();
    renderTable({ onSelectAll });

    await waitFor(() => {
      expect(screen.getByText('Dataset Alpha')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(onSelectAll).toHaveBeenCalledWith(['a2', 'a1']);
  });
});
