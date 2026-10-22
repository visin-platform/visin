import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingDetailTabs from './TrainingDetailTabs';

describe('TrainingDetailTabs', () => {
  it('renders every tab but Models when the run keeps no model', () => {
    render(<TrainingDetailTabs value="overview" onChange={vi.fn()} />);

    ['Overview', 'Epochs', 'Evaluations', 'Visualizations', 'System Info', 'Config', 'Benchmarks', 'Analysis'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole('tab', { name: 'Models' })).not.toBeInTheDocument();
  });

  it('shows Models after Visualizations when the run keeps one', () => {
    render(<TrainingDetailTabs value="models" onChange={vi.fn()} showModels />);

    const names = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(names.slice(3, 5)).toEqual(['Visualizations', 'Models']);
    expect(screen.getByRole('tab', { name: 'Models' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange with the clicked tab name', () => {
    const onChange = vi.fn();
    render(<TrainingDetailTabs value="overview" onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Benchmarks' }));

    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'benchmarks');
  });
});
