import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BulkActionsBar from './BulkActionsBar';

function baseProps(overrides: Partial<React.ComponentProps<typeof BulkActionsBar>> = {}) {
  return {
    selectedCount: 2,
    onExport: vi.fn(),
    onCompare: vi.fn(),
    onDelete: vi.fn(),
    isAuthenticated: true,
    ...overrides
  };
}

describe('BulkActionsBar', () => {
  it('renders nothing when selectedCount is 0', () => {
    const { container } = render(<BulkActionsBar {...baseProps({ selectedCount: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count and export button', () => {
    render(<BulkActionsBar {...baseProps()} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  it('shows the Compare button only when more than one item is selected', () => {
    const { rerender } = render(<BulkActionsBar {...baseProps({ selectedCount: 1 })} />);
    expect(screen.queryByText('Compare')).not.toBeInTheDocument();

    rerender(<BulkActionsBar {...baseProps({ selectedCount: 2 })} />);
    expect(screen.getByText('Compare')).toBeInTheDocument();
  });

  it('hides the Delete button when not authenticated', () => {
    render(<BulkActionsBar {...baseProps({ isAuthenticated: false })} />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('calls the respective handlers when buttons are clicked', () => {
    const onExport = vi.fn();
    const onCompare = vi.fn();
    const onDelete = vi.fn();
    render(<BulkActionsBar {...baseProps({ onExport, onCompare, onDelete })} />);

    fireEvent.click(screen.getByText('Export CSV'));
    expect(onExport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Compare'));
    expect(onCompare).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
