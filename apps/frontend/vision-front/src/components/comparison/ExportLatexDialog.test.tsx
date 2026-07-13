import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportLatexDialog from './ExportLatexDialog';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  activeTab: 0,
  onTabChange: vi.fn(),
  trainingLatex: '\\begin{table}training\\end{table}',
  testingLatex: '',
  benchmarkingLatex: '\\begin{table}benchmark\\end{table}',
  allLatex: '\\begin{table}all\\end{table}',
  copied: false,
  onCopyAll: vi.fn()
};

describe('ExportLatexDialog', () => {
  it('renders latex content for the active tab', () => {
    render(<ExportLatexDialog {...baseProps} />);
    expect(screen.getByText(baseProps.trainingLatex)).toBeInTheDocument();
  });

  it('shows "No data available" alert when the active tab has empty latex', () => {
    render(<ExportLatexDialog {...baseProps} activeTab={1} />);
    expect(screen.getByText('No data available for this section.')).toBeInTheDocument();
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<ExportLatexDialog {...baseProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Benchmarking'));
    expect(onTabChange).toHaveBeenCalledWith(2);
  });

  it('disables the Copy All Tabs button when allLatex is empty', () => {
    render(<ExportLatexDialog {...baseProps} allLatex="" />);
    expect(screen.getByRole('button', { name: /Copy All Tabs/i })).toBeDisabled();
  });

  it('calls onCopyAll when Copy All Tabs is clicked', () => {
    const onCopyAll = vi.fn();
    render(<ExportLatexDialog {...baseProps} onCopyAll={onCopyAll} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy All Tabs/i }));
    expect(onCopyAll).toHaveBeenCalled();
  });

  it('shows "Copied!" label when copied is true', () => {
    render(<ExportLatexDialog {...baseProps} copied />);
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(<ExportLatexDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getAllByText('Close')[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
