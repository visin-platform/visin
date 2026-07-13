import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfigsTable from './ConfigsTable';
import { Config } from '../../types';

const configs: Config[] = [
  {
    _id: 'cfg1',
    config_uuid: 'uuid-1',
    summary: 'Summary 1',
    config_name: 'Config One',
    config_data: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    _id: 'cfg2',
    config_uuid: 'uuid-2',
    summary: 'Summary 2',
    config_data: {},
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z'
  }
];

function baseProps(overrides: Partial<React.ComponentProps<typeof ConfigsTable>> = {}) {
  return {
    configs,
    loading: false,
    selectedConfigIds: new Set<string>(),
    onSelectAll: vi.fn(),
    onSelectConfig: vi.fn(),
    onViewDetails: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDeleteMultiple: vi.fn(),
    ...overrides
  };
}

describe('ConfigsTable', () => {
  it('shows a spinner while loading', () => {
    const { container } = render(<ConfigsTable {...baseProps({ loading: true })} />);
    expect(container.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });

  it('shows an empty message when there are no configs', () => {
    render(<ConfigsTable {...baseProps({ configs: [] })} />);
    expect(screen.getByText('No configs uploaded yet')).toBeInTheDocument();
  });

  it('renders config rows with fallback name for unnamed configs', () => {
    render(<ConfigsTable {...baseProps()} />);
    expect(screen.getByText('Config One')).toBeInTheDocument();
    expect(screen.getByText('Unnamed')).toBeInTheDocument();
    expect(screen.getByText('Summary 1')).toBeInTheDocument();
  });

  it('shows selection banner and calls onDeleteMultiple', () => {
    const onDeleteMultiple = vi.fn();
    const selectedConfigIds = new Set(['cfg1']);
    render(<ConfigsTable {...baseProps({ selectedConfigIds, onDeleteMultiple })} />);
    expect(screen.getByText('1 config(s) selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete Selected'));
    expect(onDeleteMultiple).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectConfig when a row checkbox is toggled', () => {
    const onSelectConfig = vi.fn();
    render(<ConfigsTable {...baseProps({ onSelectConfig })} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // index 0 is select-all, index 1 is first row
    fireEvent.click(checkboxes[1]);
    expect(onSelectConfig).toHaveBeenCalledWith('cfg1');
  });

  it('calls onSelectAll when the header checkbox is toggled', () => {
    const onSelectAll = vi.fn();
    render(<ConfigsTable {...baseProps({ onSelectAll })} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('calls onViewDetails, onEdit and onDelete from row actions', () => {
    const onViewDetails = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ConfigsTable {...baseProps({ onViewDetails, onEdit, onDelete })} />);

    fireEvent.click(screen.getAllByLabelText('View config details')[0]);
    expect(onViewDetails).toHaveBeenCalledWith(configs[0]);

    fireEvent.click(screen.getAllByLabelText('Edit config name')[0]);
    expect(onEdit).toHaveBeenCalledWith(configs[0]);

    fireEvent.click(screen.getAllByLabelText('Delete config')[0]);
    expect(onDelete).toHaveBeenCalledWith('cfg1');
  });
});
