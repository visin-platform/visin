import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DatasetExportTab from './DatasetExportTab';

describe('DatasetExportTab', () => {
  it('calls onExport with the right filter for each button', () => {
    const onExport = vi.fn();
    render(<DatasetExportTab onExport={onExport} exporting={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export Good Images' }));
    expect(onExport).toHaveBeenCalledWith('good');

    fireEvent.click(screen.getByRole('button', { name: 'Export Bad Images' }));
    expect(onExport).toHaveBeenCalledWith('bad');

    fireEvent.click(screen.getByRole('button', { name: 'Export All Images' }));
    expect(onExport).toHaveBeenCalledWith('all');
  });

  it('disables all buttons and shows a spinner+label while exporting', () => {
    render(<DatasetExportTab onExport={vi.fn()} exporting="good" />);

    expect(screen.getByText('Exporting Good Images...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporting good images/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export Bad Images' })).toBeDisabled();
  });
});
