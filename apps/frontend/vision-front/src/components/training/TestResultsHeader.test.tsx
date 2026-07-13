import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestResultsHeader from './TestResultsHeader';

describe('TestResultsHeader', () => {
  it('hides the upload button when not authenticated', () => {
    render(<TestResultsHeader uploading={false} onTestResultFileUpload={vi.fn()} isAuthenticated={false} />);

    expect(screen.queryByRole('button', { name: /upload results/i })).not.toBeInTheDocument();
  });

  it('shows "Uploading..." and disables the button while uploading', () => {
    render(<TestResultsHeader uploading onTestResultFileUpload={vi.fn()} isAuthenticated />);

    expect(screen.getByRole('button', { name: /uploading/i })).toBeDisabled();
  });

  it('clicking Upload Results triggers the hidden file input', () => {
    render(<TestResultsHeader uploading={false} onTestResultFileUpload={vi.fn()} isAuthenticated />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(screen.getByRole('button', { name: /upload results/i }));

    expect(clickSpy).toHaveBeenCalled();
  });

  it('calls onTestResultFileUpload with the selected files', async () => {
    const onTestResultFileUpload = vi.fn().mockResolvedValue(undefined);
    render(<TestResultsHeader uploading={false} onTestResultFileUpload={onTestResultFileUpload} isAuthenticated />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'result.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onTestResultFileUpload).toHaveBeenCalledTimes(1);
    expect(onTestResultFileUpload.mock.calls[0][0]).toHaveLength(1);
  });

  it('does nothing when no files are selected', () => {
    const onTestResultFileUpload = vi.fn();
    render(<TestResultsHeader uploading={false} onTestResultFileUpload={onTestResultFileUpload} isAuthenticated />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [] } });

    expect(onTestResultFileUpload).not.toHaveBeenCalled();
  });
});
