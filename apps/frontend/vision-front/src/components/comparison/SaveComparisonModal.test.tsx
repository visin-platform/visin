import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SaveComparisonModal from './SaveComparisonModal';
import { comparisonService } from '../../services/comparisonService';

vi.mock('../../services/comparisonService', () => ({
  comparisonService: {
    createComparison: vi.fn()
  }
}));

const renderWithClient = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('SaveComparisonModal', () => {
  beforeEach(() => {
    vi.mocked(comparisonService.createComparison).mockReset();
  });

  it('renders a checkbox per training id and selects all by default', () => {
    renderWithClient(<SaveComparisonModal open onClose={vi.fn()} trainingIds={['train1234', 'train5678']} />);
    expect(screen.getByText('Training rain1234')).toBeInTheDocument();
    expect(screen.getByText('Training rain5678')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(cb => expect(cb).toBeChecked());
  });

  it('uses initialSelectedIds when provided instead of all trainingIds', () => {
    renderWithClient(
      <SaveComparisonModal open onClose={vi.fn()} trainingIds={['train1', 'train2']} initialSelectedIds={['train1']} />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('toggles a training selection on checkbox click', () => {
    // Pass a stable initialSelectedIds reference: the component's default `= []`
    // param would otherwise create a new array each render and re-trigger the
    // sync effect, masking the toggle.
    const initialSelectedIds = ['train1'];
    renderWithClient(<SaveComparisonModal open onClose={vi.fn()} trainingIds={['train1']} initialSelectedIds={initialSelectedIds} />);
    const checkbox = screen.getAllByRole('checkbox')[0];
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('disables Save when name is blank', () => {
    renderWithClient(<SaveComparisonModal open onClose={vi.fn()} trainingIds={['train1']} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('calls createComparison and onClose on successful save', async () => {
    vi.mocked(comparisonService.createComparison).mockResolvedValue({ success: true, data: {} } as any);
    const onClose = vi.fn();
    // Pass a stable initialSelectedIds reference so the mount-sync effect
    // (deps include initialSelectedIds) doesn't re-fire on every keystroke
    // and reset the name field back to ''.
    renderWithClient(<SaveComparisonModal open onClose={onClose} trainingIds={['train1']} initialSelectedIds={['train1']} />);

    fireEvent.change(screen.getByLabelText(/Comparison Name/), { target: { value: 'New Comparison' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(comparisonService.createComparison).toHaveBeenCalledWith({
      name: 'New Comparison',
      description: '',
      type: 'trainings',
      itemIds: ['train1']
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('logs an error and keeps dialog open when save fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(comparisonService.createComparison).mockRejectedValue(new Error('save failed'));
    const onClose = vi.fn();
    // Pass a stable initialSelectedIds reference so the mount-sync effect
    // (deps include initialSelectedIds) doesn't re-fire on every keystroke
    // and reset the name field back to ''.
    renderWithClient(<SaveComparisonModal open onClose={onClose} trainingIds={['train1']} initialSelectedIds={['train1']} />);

    fireEvent.change(screen.getByLabelText(/Comparison Name/), { target: { value: 'New Comparison' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderWithClient(<SaveComparisonModal open onClose={onClose} trainingIds={['train1']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
