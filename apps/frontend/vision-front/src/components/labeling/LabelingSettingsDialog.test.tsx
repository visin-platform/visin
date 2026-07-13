import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import LabelingSettingsDialog from './LabelingSettingsDialog';

const weatherConditions = [
  { value: 'day_fair' as const, label: 'Day Fair' },
  { value: 'night_rain' as const, label: 'Night Rain' }
];

function baseProps(overrides: Partial<React.ComponentProps<typeof LabelingSettingsDialog>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    imageLimit: 50,
    setImageLimit: vi.fn(),
    selectedWeatherFilter: '' as const,
    setSelectedWeatherFilter: vi.fn(),
    resetLabeling: vi.fn(),
    weatherConditions,
    ...overrides
  };
}

describe('LabelingSettingsDialog', () => {
  it('does not render when closed', () => {
    render(<LabelingSettingsDialog {...baseProps({ open: false })} />);
    expect(screen.queryByText('Labeling Settings')).not.toBeInTheDocument();
  });

  it('renders the image limit and weather filter options', () => {
    render(<LabelingSettingsDialog {...baseProps()} />);
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Day Fair')).toBeInTheDocument();
    expect(within(listbox).getByText('Night Rain')).toBeInTheDocument();
  });

  it('calls setImageLimit with a numeric value on change', () => {
    const setImageLimit = vi.fn();
    render(<LabelingSettingsDialog {...baseProps({ setImageLimit })} />);
    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '20' } });
    expect(setImageLimit).toHaveBeenCalledWith(20);
  });

  it('calls setSelectedWeatherFilter when an option is selected', () => {
    const setSelectedWeatherFilter = vi.fn();
    render(<LabelingSettingsDialog {...baseProps({ setSelectedWeatherFilter })} />);
    fireEvent.mouseDown(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByText('Night Rain'));
    expect(setSelectedWeatherFilter).toHaveBeenCalledWith('night_rain');
  });

  it('calls onClose and resetLabeling from the action buttons', () => {
    const onClose = vi.fn();
    const resetLabeling = vi.fn();
    render(<LabelingSettingsDialog {...baseProps({ onClose, resetLabeling })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Return to Setup'));
    expect(resetLabeling).toHaveBeenCalledTimes(1);
  });
});
