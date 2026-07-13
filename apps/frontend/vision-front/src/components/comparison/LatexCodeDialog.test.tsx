import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LatexCodeDialog from './LatexCodeDialog';

describe('LatexCodeDialog', () => {
  it('renders the provided latex code', () => {
    render(<LatexCodeDialog open latexCode="SAMPLE_LATEX_TABLE_CODE" onClose={vi.fn()} copyToClipboard={vi.fn()} />);
    expect(screen.getByText('SAMPLE_LATEX_TABLE_CODE')).toBeInTheDocument();
  });

  it('calls copyToClipboard with the latex code when Copy is clicked', () => {
    const copyToClipboard = vi.fn();
    render(<LatexCodeDialog open latexCode="latex-code-here" onClose={vi.fn()} copyToClipboard={copyToClipboard} />);
    fireEvent.click(screen.getByText('Copy'));
    expect(copyToClipboard).toHaveBeenCalledWith('latex-code-here');
  });

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(<LatexCodeDialog open latexCode="" onClose={onClose} copyToClipboard={vi.fn()} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render dialog content when closed', () => {
    render(<LatexCodeDialog open={false} latexCode="hidden-code" onClose={vi.fn()} copyToClipboard={vi.fn()} />);
    expect(screen.queryByText('hidden-code')).not.toBeInTheDocument();
  });
});
