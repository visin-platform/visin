import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  isAuthenticated: true,
  canWrite: () => true
};

const renderTable = (overrides: Partial<React.ComponentProps<typeof TrainingsTable>> = {}) =>
  render(
    <MemoryRouter>
      <TrainingsTable trainings={trainings} {...baseProps} {...overrides} />
    </MemoryRouter>
  );

describe('TrainingsTable', () => {
  it('shows mutation controls only for writable rows in a mixed public list', () => {
    renderTable({ canWrite: id => id === 't1' });
    expect(screen.getAllByTestId('EditIcon')).toHaveLength(1);
    expect(screen.getAllByTestId('DeleteIcon')).toHaveLength(1);
  });

  describe('grouped by project', () => {
    const grouped = [
      { ...trainings[0], _id: 'a1', name: 'A newest', projectId: 'pa' },
      { ...trainings[1], _id: 'b1', name: 'B newer', projectId: 'pb' },
      { ...trainings[1], _id: 'a2', name: 'A older', projectId: 'pa' },
      { ...trainings[1], _id: 'n1', name: 'Loose run' }
    ] as Training[];
    const names = { pa: 'Alpha', pb: 'Beta' };

    it('puts runs under their project, the one with the latest run first', () => {
      renderTable({ trainings: grouped, projectNames: names });

      const order = screen
        .getAllByRole('row')
        .map((row) => row.textContent ?? '')
        .filter((text) => /Alpha|Beta|No project|A newest|B newer|A older|Loose run/.test(text))
        .map((text) => text.match(/Alpha|Beta|No project|A newest|B newer|A older|Loose run/)![0]);
      expect(order).toEqual(['Alpha', 'A newest', 'A older', 'Beta', 'B newer', 'No project', 'Loose run']);
      expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/projects/pa');
    });

    it('stays a flat list when sorted by something other than recency', () => {
      renderTable({ trainings: grouped, projectNames: names, sortBy: 'name' });

      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    });

    it('stays a flat list until the project names have loaded', () => {
      renderTable({ trainings: grouped });

      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    });
  });

  it('shows the shape of the list while it loads, not an empty page', () => {
    renderTable({ isLoading: true });
    expect(screen.getByRole('status', { name: 'Loading trainings' })).toBeInTheDocument();
    expect(screen.queryByText('No training runs available')).not.toBeInTheDocument();
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

describe('TrainingsTable on a phone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('lists each run full-width, leading to it, with its figures under the name', () => {
    renderTable();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const row = screen.getByRole('link', { name: /Training One/ });
    expect(row).toHaveAttribute('href', '/trainings/t1');
    expect(row).toHaveTextContent('10 epochs');
    expect(row).toHaveTextContent('seg');
  });

  it('shows the first tags and counts the rest', () => {
    renderTable({ trainings: [{ ...trainings[0], tags: ['a', 'b', 'c', 'd', 'e'] }] });

    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.queryByText('d')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('selects runs for comparison from their checkboxes', () => {
    renderTable();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Training One' }));
    expect(baseProps.onSelectTraining).toHaveBeenCalledWith('t1');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all trainings' }));
    expect(baseProps.onSelectAll).toHaveBeenCalled();
  });

  it('sorts from the sort control, and flips the order', () => {
    renderTable();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sort by' }));
    fireEvent.click(screen.getByRole('option', { name: 'Name' }));
    expect(baseProps.onSort).toHaveBeenCalledWith('name');

    fireEvent.click(screen.getByRole('button', { name: 'Sorted descending' }));
    expect(baseProps.onSort).toHaveBeenCalledWith('createdAt');
  });

  it('edits and deletes from the row menu, where the viewer may', () => {
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Training One' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(baseProps.onEdit).toHaveBeenCalledWith(trainings[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Training One' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(baseProps.onDelete).toHaveBeenCalledWith('t1');
  });

  it('offers no menu on runs the viewer cannot change', () => {
    renderTable({ canWrite: () => false });

    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });
});
