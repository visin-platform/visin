import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DatasetDetailTabs from './DatasetDetailTabs';

describe('DatasetDetailTabs', () => {
  it('renders the four tabs and highlights the selected one', () => {
    render(<DatasetDetailTabs value={1} onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Categories', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Images' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Export' })).toBeInTheDocument();
  });

  it('calls onChange when a different tab is clicked', () => {
    const onChange = vi.fn();
    render(<DatasetDetailTabs value={0} onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Images' }));

    expect(onChange).toHaveBeenCalledWith(expect.anything(), 2);
  });
});
