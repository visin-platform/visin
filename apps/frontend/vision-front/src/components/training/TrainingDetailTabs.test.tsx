import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingDetailTabs from './TrainingDetailTabs';

describe('TrainingDetailTabs', () => {
  it('renders all seven tabs', () => {
    render(<TrainingDetailTabs value={0} onChange={vi.fn()} />);

    ['Overview', 'Epochs', 'Test Results', 'Visualizations', 'System Info', 'Config', 'Benchmarks'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  it('calls onChange with the clicked tab index', () => {
    const onChange = vi.fn();
    render(<TrainingDetailTabs value={0} onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Benchmarks' }));

    expect(onChange).toHaveBeenCalledWith(expect.anything(), 6);
  });
});
