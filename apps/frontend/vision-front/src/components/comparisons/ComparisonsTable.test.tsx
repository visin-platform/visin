import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createTheme } from '@mui/material/styles';
import ComparisonsTable from './ComparisonsTable';
import { Comparison } from '@/types';

const theme = createTheme();

const comparisons: Comparison[] = [
  {
    _id: 'c1',
    uuid: 'uuid-1',
    name: 'Comparison One',
    description: 'First comparison',
    type: 'trainings',
    itemIds: ['t1', 't2'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    _id: 'c2',
    uuid: 'uuid-2',
    name: 'Comparison Two',
    type: 'tests',
    itemIds: ['t3'],
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z'
  }
];

function baseProps(overrides: Partial<React.ComponentProps<typeof ComparisonsTable>> = {}) {
  return {
    comparisons,
    sortBy: 'name' as const,
    sortOrder: 'asc' as const,
    onSort: vi.fn(),
    onViewComparison: vi.fn(),
    onEditComparison: vi.fn(),
    onDeleteComparison: vi.fn(),
    canDelete: () => true,
    formatTimestamp: (t: string) => `formatted-${t}`,
    getTypeColor: () => 'primary' as const,
    theme,
    ...overrides
  };
}

describe('ComparisonsTable', () => {
  it('renders a row per comparison with name, description, type and item count', () => {
    render(<ComparisonsTable {...baseProps()} />);
    expect(screen.getByText('Comparison One')).toBeInTheDocument();
    expect(screen.getByText('First comparison')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('calls onSort when clicking a sortable column header', () => {
    const onSort = vi.fn();
    render(<ComparisonsTable {...baseProps({ onSort })} />);
    fireEvent.click(screen.getByText('Type'));
    expect(onSort).toHaveBeenCalledWith('type');
  });

  it('calls onViewComparison when clicking a row', () => {
    const onViewComparison = vi.fn();
    render(<ComparisonsTable {...baseProps({ onViewComparison })} />);
    fireEvent.click(screen.getByText('Comparison One'));
    expect(onViewComparison).toHaveBeenCalledWith(comparisons[0]);
  });

  it('calls onEditComparison and onDeleteComparison without triggering row click', () => {
    const onEditComparison = vi.fn();
    const onDeleteComparison = vi.fn();
    const onViewComparison = vi.fn();
    render(
      <ComparisonsTable
        {...baseProps({ onEditComparison, onDeleteComparison, onViewComparison })}
      />
    );

    fireEvent.click(screen.getAllByLabelText('Edit')[0]);
    expect(onEditComparison).toHaveBeenCalledWith(comparisons[0]);

    fireEvent.click(screen.getAllByLabelText('Delete')[0]);
    expect(onDeleteComparison).toHaveBeenCalledWith('c1');

    expect(onViewComparison).not.toHaveBeenCalled();
  });

  it('hides edit/delete actions when canDelete is false', () => {
    render(<ComparisonsTable {...baseProps({ canDelete: () => false })} />);
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument();
  });

  it('shows sort arrow icon for the active sort column', () => {
    const { container } = render(<ComparisonsTable {...baseProps({ sortBy: 'createdAt', sortOrder: 'desc' })} />);
    expect(container.querySelector('[data-testid="ArrowDownwardIcon"]')).toBeInTheDocument();
  });
});
