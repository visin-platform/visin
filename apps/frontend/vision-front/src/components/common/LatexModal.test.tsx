import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LatexModal from './LatexModal';

describe('LatexModal', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn()
      }
    });
  });

  it('does not render dialog content when closed', () => {
    render(<LatexModal open={false} onClose={vi.fn()} title="My Title" code="some code" />);
    expect(screen.queryByText('My Title')).not.toBeInTheDocument();
  });

  it('renders title and code when open', () => {
    render(<LatexModal open={true} onClose={vi.fn()} title="My Title" code="latex source code" />);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('latex source code')).toBeInTheDocument();
  });

  it('copies code to clipboard when Copy button clicked', () => {
    render(<LatexModal open={true} onClose={vi.fn()} title="Title" code="latex-code" />);
    fireEvent.click(screen.getByText('Copy'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('latex-code');
  });

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(<LatexModal open={true} onClose={onClose} title="Title" code="code" />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the icon close button is clicked', () => {
    const onClose = vi.fn();
    render(<LatexModal open={true} onClose={onClose} title="Title" code="code" />);
    const buttons = screen.getAllByRole('button');
    // First icon button in the title area
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
