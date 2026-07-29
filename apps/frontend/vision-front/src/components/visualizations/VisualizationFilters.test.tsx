import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import VisualizationFilters from './VisualizationFilters';
import { Epoch, Visualization } from '../../types';

const epochs: Epoch[] = [
  {
    _id: 'e1',
    trainingId: 't1',
    training_uuid: 'training-1',
    epoch_uuid: 'epoch-uuid-1',
    epoch: 1,
    timestamp: '2024-01-01T00:00:00.000Z',
    results: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
];

const viz: Visualization = {
  _id: 'v1',
  epoch_uuid: 'e1',
  visualization_uuid: 'viz-1',
  filename: 'file1.png',
  type: 'segment',
  fileId: 'file1',
  uploadedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

function baseProps(overrides: Partial<React.ComponentProps<typeof VisualizationFilters>> = {}) {
  return {
    selectedType: 'all',
    setSelectedType: vi.fn(),
    types: ['segment', 'overlay'],
    selectedEpochFilter: 'all',
    setSelectedEpochFilter: vi.fn(),
    epochs,
    selectedImageName: '',
    setSelectedImageName: vi.fn(),
    selectedForCompare: [],
    setSelectedForCompare: vi.fn(),
    ...overrides
  };
}

describe('VisualizationFilters', () => {
  it('renders the Filters label and search field', () => {
    render(<VisualizationFilters {...baseProps()} />);
    expect(screen.getByText('Filters:')).toBeInTheDocument();
    expect(screen.getByLabelText('Search by Name')).toBeInTheDocument();
  });

  it('calls setSelectedImageName when typing in the search field', () => {
    const setSelectedImageName = vi.fn();
    render(<VisualizationFilters {...baseProps({ setSelectedImageName })} />);
    fireEvent.change(screen.getByLabelText('Search by Name'), { target: { value: 'img_001' } });
    expect(setSelectedImageName).toHaveBeenCalledWith('img_001');
  });

  it('calls setSelectedType when a type option is selected', () => {
    const setSelectedType = vi.fn();
    render(<VisualizationFilters {...baseProps({ setSelectedType })} />);
    const [typeSelect] = screen.getAllByRole('combobox');
    fireEvent.mouseDown(typeSelect);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('overlay'));
    expect(setSelectedType).toHaveBeenCalledWith('overlay');
  });

  it('calls setSelectedEpochFilter when an epoch option is selected', () => {
    const setSelectedEpochFilter = vi.fn();
    render(<VisualizationFilters {...baseProps({ setSelectedEpochFilter })} />);
    const [, epochSelect] = screen.getAllByRole('combobox');
    fireEvent.mouseDown(epochSelect);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Epoch 1'));
    expect(setSelectedEpochFilter).toHaveBeenCalledWith('1');
  });

  it('shows a selected-count chip and clears selection when deleted', () => {
    const setSelectedForCompare = vi.fn();
    render(<VisualizationFilters {...baseProps({ selectedForCompare: [viz], setSelectedForCompare })} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('CancelIcon'));
    expect(setSelectedForCompare).toHaveBeenCalledWith([]);
  });

  it('does not show the selected-count chip when nothing is selected', () => {
    render(<VisualizationFilters {...baseProps()} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});
