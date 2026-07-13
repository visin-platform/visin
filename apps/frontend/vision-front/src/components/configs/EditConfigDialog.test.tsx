import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditConfigDialog from './EditConfigDialog';
import { Config } from '../../types';

const config: Config = {
  _id: 'cfg1',
  config_uuid: 'uuid-1',
  summary: 'Config summary text',
  config_data: { key: 'value' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

function baseProps(overrides: Partial<React.ComponentProps<typeof EditConfigDialog>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    config,
    configName: 'My Config',
    onConfigNameChange: vi.fn(),
    loading: false,
    ...overrides
  };
}

describe('EditConfigDialog', () => {
  it('does not render when closed', () => {
    render(<EditConfigDialog {...baseProps({ open: false })} />);
    expect(screen.queryByText('Edit Config')).not.toBeInTheDocument();
  });

  it('renders nothing config-specific when config is null', () => {
    render(<EditConfigDialog {...baseProps({ config: null })} />);
    expect(screen.getByText('Edit Config')).toBeInTheDocument();
    expect(screen.queryByText('Config UUID:')).not.toBeInTheDocument();
  });

  it('renders config name field, uuid and summary', () => {
    render(<EditConfigDialog {...baseProps()} />);
    expect(screen.getByDisplayValue('My Config')).toBeInTheDocument();
    expect(screen.getByText('uuid-1')).toBeInTheDocument();
    expect(screen.getByText('Config summary text')).toBeInTheDocument();
    expect(screen.getByText('value')).toBeInTheDocument();
  });

  it('calls onConfigNameChange when typing in the name field', () => {
    const onConfigNameChange = vi.fn();
    render(<EditConfigDialog {...baseProps({ onConfigNameChange })} />);
    fireEvent.change(screen.getByLabelText('Config Name'), { target: { value: 'Renamed' } });
    expect(onConfigNameChange).toHaveBeenCalledWith('Renamed');
  });

  it('disables Save when configName is empty', () => {
    render(<EditConfigDialog {...baseProps({ configName: '   ' })} />);
    expect(screen.getByText('Save').closest('button')).toBeDisabled();
  });

  it('calls onSave when Save is clicked', () => {
    const onSave = vi.fn();
    render(<EditConfigDialog {...baseProps({ onSave })} />);
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows Saving... state while loading', () => {
    render(<EditConfigDialog {...baseProps({ loading: true })} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
  });
});
