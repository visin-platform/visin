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
    onViewDetails: vi.fn(),
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

  it('calls onViewDetails from the row action', () => {
    const onViewDetails = vi.fn();
    render(<ConfigsTable {...baseProps({ onViewDetails })} />);

    fireEvent.click(screen.getAllByLabelText('View config details')[0]);
    expect(onViewDetails).toHaveBeenCalledWith(configs[0]);
  });

  // Configs are a read-only record of what a run used, so the table offers no
  // way to select, rename or delete one.
  it('offers no selection or mutation controls', () => {
    render(<ConfigsTable {...baseProps()} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByLabelText('Edit config name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete config')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete Selected')).not.toBeInTheDocument();
  });
});
