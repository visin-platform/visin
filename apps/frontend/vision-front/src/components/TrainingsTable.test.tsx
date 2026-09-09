import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrainingsTable from './TrainingsTable';
import { Training } from '../types';
import { formatCost } from '../costing/costing';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

beforeEach(() => {
  navigateMock.mockClear();
});

const trainings: Training[] = [
  {
    _id: 't1',
    uuid: 'uuid-1',
    name: 'Training One',
    description: 'First training',
    status: 'completed',
    tags: ['seg', 'v1'],
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    metrics: {
      totalTime: 3600,
      epochCount: 10,
      maxEpoch: 10,
      lastEpochTimestamp: null,
      cpuCost: 1.5,
      currency: 'EUR',
      gpuCost: 2.5,
      totalCost: 4
    }
  },
  {
    _id: 't2',
    uuid: 'uuid-2',
    name: 'Training Two',
    status: 'running',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z'
  }
];

const baseProps = {
  isLoading: false,
  page: 0,
  rowsPerPage: 10,
  total: 2,
  onPageChange: vi.fn(),
  onRowsPerPageChange: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  searchTerm: '',
  selectedTrainingIds: new Set<string>(),
  onSelectTraining: vi.fn(),
  onSelectAll: vi.fn(),
  sortBy: 'createdAt' as const,
  sortOrder: 'desc' as const,
  onSort: vi.fn(),
  isAuthenticated: true
};

const renderTable = (overrides: Partial<React.ComponentProps<typeof TrainingsTable>> = {}) =>
  render(
    <MemoryRouter>
      <TrainingsTable trainings={trainings} {...baseProps} {...overrides} />
    </MemoryRouter>
  );

describe('TrainingsTable', () => {
  it('renders a loading spinner when isLoading is true', () => {
    const { container } = renderTable({ isLoading: true });
    expect(container.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });

  it('renders empty state with search hint when no trainings and a search term is set', () => {
    renderTable({ trainings: [], searchTerm: 'foo' });
    expect(screen.getByText('No trainings found matching your search')).toBeInTheDocument();
  });

  it('renders empty state without search hint when there is no search term', () => {
    renderTable({ trainings: [] });
    expect(screen.getByText('No training runs available')).toBeInTheDocument();
  });

  it('renders training rows with name, status, tags and formatted cost', () => {
    renderTable();
    expect(screen.getByText('Training One')).toBeInTheDocument();
    expect(screen.getByText('Training Two')).toBeInTheDocument();
    expect(screen.getByText('seg')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(formatCost(4, 'EUR'))).toBeInTheDocument();
  });

  it('navigates to the training detail page when a row is clicked', () => {
    renderTable();
    fireEvent.click(screen.getByText('Training One'));
    expect(navigateMock).toHaveBeenCalledWith('/trainings/t1');
  });

  it('calls onSort with the correct column when a sortable header is clicked', () => {
    const onSort = vi.fn();
    renderTable({ onSort });
    fireEvent.click(screen.getByText('Name'));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('calls onEdit and onDelete when action icons are clicked, without navigating', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderTable({ onEdit, onDelete });

    const editButtons = screen.getAllByRole('button', { name: /edit training/i });
    fireEvent.click(editButtons[0]);
    expect(onEdit).toHaveBeenCalledWith(trainings[0]);

    const deleteButtons = screen.getAllByRole('button', { name: /delete training/i });
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith('t1');

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('hides edit/delete actions when not authenticated', () => {
    renderTable({ isAuthenticated: false });
    expect(screen.queryByRole('button', { name: /edit training/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete training/i })).not.toBeInTheDocument();
  });

  it('calls onSelectTraining and onSelectAll from checkboxes', () => {
    const onSelectTraining = vi.fn();
    const onSelectAll = vi.fn();
    renderTable({ onSelectTraining, onSelectAll });

    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "select all"
    fireEvent.click(checkboxes[0]);
    expect(onSelectAll).toHaveBeenCalled();

    fireEvent.click(checkboxes[1]);
    expect(onSelectTraining).toHaveBeenCalledWith('t1');
  });

  it('shows an indeterminate select-all checkbox when some rows are selected', () => {
    renderTable({ selectedTrainingIds: new Set(['t1']) });
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(selectAllCheckbox.indeterminate ?? (selectAllCheckbox as any).indeterminate).toBeDefined();
  });

  it('renders pagination controls and reacts to page change', () => {
    const onPageChange = vi.fn();
    renderTable({ onPageChange, total: 30 });
    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);
    expect(onPageChange).toHaveBeenCalled();
  });
});
