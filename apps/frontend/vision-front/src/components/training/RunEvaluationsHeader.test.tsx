import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RunEvaluationsHeader from './RunEvaluationsHeader';

describe('RunEvaluationsHeader', () => {
  it('hides the upload button when not authenticated', () => {
    render(<RunEvaluationsHeader uploading={false} onEvaluationFileUpload={vi.fn()} isAuthenticated={false} />);

    expect(screen.queryByRole('button', { name: /upload results/i })).not.toBeInTheDocument();
  });

  it('shows "Uploading..." and disables the button while uploading', () => {
    render(<RunEvaluationsHeader uploading onEvaluationFileUpload={vi.fn()} isAuthenticated />);

    expect(screen.getByRole('button', { name: /uploading/i })).toBeDisabled();
  });

  it('clicking Upload Results triggers the hidden file input', () => {
    render(<RunEvaluationsHeader uploading={false} onEvaluationFileUpload={vi.fn()} isAuthenticated />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(screen.getByRole('button', { name: /upload results/i }));

    expect(clickSpy).toHaveBeenCalled();
  });

  it('calls onEvaluationFileUpload with the selected files', async () => {
    const onEvaluationFileUpload = vi.fn().mockResolvedValue(undefined);
    render(<RunEvaluationsHeader uploading={false} onEvaluationFileUpload={onEvaluationFileUpload} isAuthenticated />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'result.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onEvaluationFileUpload).toHaveBeenCalledTimes(1);
    expect(onEvaluationFileUpload.mock.calls[0][0]).toHaveLength(1);
  });

  it('does nothing when no files are selected', () => {
    const onEvaluationFileUpload = vi.fn();
    render(<RunEvaluationsHeader uploading={false} onEvaluationFileUpload={onEvaluationFileUpload} isAuthenticated />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [] } });

    expect(onEvaluationFileUpload).not.toHaveBeenCalled();
  });
});
