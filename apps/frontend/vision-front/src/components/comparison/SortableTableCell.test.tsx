import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Table, TableBody, TableRow } from '@mui/material';
import SortableTableCell from './SortableTableCell';

describe('SortableTableCell', () => {
  it('renders children text', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <SortableTableCell column="name" sortColumn="name" sortDirection="asc" onSort={vi.fn()}>
              Name
            </SortableTableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('calls onSort with the column when clicked', () => {
    const onSort = vi.fn();
    render(
      <Table>
        <TableBody>
          <TableRow>
            <SortableTableCell column="time" sortColumn="name" sortDirection="asc" onSort={onSort}>
              Time
            </SortableTableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    fireEvent.click(screen.getByText('Time'));
    expect(onSort).toHaveBeenCalledWith('time');
  });

  it('shows ascending arrow icon when active column sorted asc', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <SortableTableCell column="name" sortColumn="name" sortDirection="asc" onSort={vi.fn()}>
              Name
            </SortableTableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(container.querySelector('[data-testid="ArrowUpwardIcon"]')).toBeInTheDocument();
  });

  it('shows descending arrow icon when active column sorted desc', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <SortableTableCell column="name" sortColumn="name" sortDirection="desc" onSort={vi.fn()}>
              Name
            </SortableTableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(container.querySelector('[data-testid="ArrowDownwardIcon"]')).toBeInTheDocument();
  });

  it('shows no arrow icon when column is not the active sort column', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <SortableTableCell column="other" sortColumn="name" sortDirection="asc" onSort={vi.fn()}>
              Other
            </SortableTableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(container.querySelector('[data-testid="ArrowUpwardIcon"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="ArrowDownwardIcon"]')).not.toBeInTheDocument();
  });
});
