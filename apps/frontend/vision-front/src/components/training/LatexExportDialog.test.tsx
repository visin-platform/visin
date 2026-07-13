import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LatexExportDialog from './LatexExportDialog';

describe('LatexExportDialog', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it('renders the LaTeX code', () => {
    render(<LatexExportDialog open onClose={vi.fn()} latexCode="\begin{table}" />);

    expect(screen.getByText(/begin\{table\}/)).toBeInTheDocument();
  });

  it('copies the code to the clipboard', () => {
    render(<LatexExportDialog open onClose={vi.fn()} latexCode="my latex" />);

    fireEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('my latex');
  });

  it('calls onClose', () => {
    const onClose = vi.fn();
    render(<LatexExportDialog open onClose={onClose} latexCode="x" />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
