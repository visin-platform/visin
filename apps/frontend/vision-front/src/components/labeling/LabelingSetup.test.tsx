import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import LabelingSetup from './LabelingSetup';

const weatherConditions = [
  { value: 'day_fair' as const, label: 'Day Fair' },
  { value: 'snow' as const, label: 'Snow' }
];

function baseProps(overrides: Partial<React.ComponentProps<typeof LabelingSetup>> = {}) {
  return {
    imageLimit: 25,
    setImageLimit: vi.fn(),
    selectedWeatherFilter: '' as const,
    setSelectedWeatherFilter: vi.fn(),
    startLabeling: vi.fn(),
    loading: false,
    weatherConditions,
    ...overrides
  };
}

describe('LabelingSetup', () => {
  it('renders the setup form with the given image limit', () => {
    render(<LabelingSetup {...baseProps()} />);
    expect(screen.getByText('Image Labeling Setup')).toBeInTheDocument();
    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
  });

  it('calls setImageLimit with a numeric value, floored at 1', () => {
    const setImageLimit = vi.fn();
    render(<LabelingSetup {...baseProps({ setImageLimit })} />);
    fireEvent.change(screen.getByDisplayValue('25'), { target: { value: '0' } });
    expect(setImageLimit).toHaveBeenCalledWith(1);
  });

  it('calls setSelectedWeatherFilter when an option is chosen', () => {
    const setSelectedWeatherFilter = vi.fn();
    render(<LabelingSetup {...baseProps({ setSelectedWeatherFilter })} />);
    fireEvent.mouseDown(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByText('Snow'));
    expect(setSelectedWeatherFilter).toHaveBeenCalledWith('snow');
  });

  it('calls startLabeling when the Start Labeling button is clicked', () => {
    const startLabeling = vi.fn();
    render(<LabelingSetup {...baseProps({ startLabeling })} />);
    fireEvent.click(screen.getByText('Start Labeling'));
    expect(startLabeling).toHaveBeenCalledTimes(1);
  });

  it('shows Loading Images... and disables the button while loading', () => {
    render(<LabelingSetup {...baseProps({ loading: true })} />);
    expect(screen.getByText('Loading Images...')).toBeInTheDocument();
    expect(screen.getByText('Loading Images...').closest('button')).toBeDisabled();
  });

  it('disables the start button when imageLimit is less than 1', () => {
    render(<LabelingSetup {...baseProps({ imageLimit: 0 })} />);
    expect(screen.getByText('Start Labeling').closest('button')).toBeDisabled();
  });
});
