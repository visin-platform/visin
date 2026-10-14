import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingEvaluationsTab from './TrainingEvaluationsTab';

const baseProps = {
  allEvaluations: [],
  evaluationsLoading: false,
  availableEpochs: [],
  uploading: false,
  uploadError: null as string | null,
  uploadSuccess: null as string | null,
  uploadResultsOpen: false,
  uploadResults: { successful: [], failed: [] },
  latexModalOpen: false,
  latexCode: '',
  onEvaluationFileUpload: vi.fn(),
  onLatexExport: vi.fn(),
  onSetUploadResultsOpen: vi.fn(),
  onSetLatexModalOpen: vi.fn(),
  onDeleteEvaluation: vi.fn(),
  isAuthenticated: true,
};

describe('TrainingEvaluationsTab', () => {
  it('renders the header and the empty-state evaluations list', () => {
    render(<TrainingEvaluationsTab {...baseProps} />);

    expect(screen.getByText('Evaluations')).toBeInTheDocument();
    expect(screen.getByText('No evaluations yet')).toBeInTheDocument();
  });

  it('shows an upload error alert that opens the results dialog', () => {
    const onSetUploadResultsOpen = vi.fn();
    render(
      <TrainingEvaluationsTab
        {...baseProps}
        uploadError="Some files failed"
        onSetUploadResultsOpen={onSetUploadResultsOpen}
      />
    );

    expect(screen.getByText('Some files failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(onSetUploadResultsOpen).toHaveBeenCalledWith(true);
  });

  it('shows an upload success alert', () => {
    render(<TrainingEvaluationsTab {...baseProps} uploadSuccess="Uploaded 3 files" />);

    expect(screen.getByText('Uploaded 3 files')).toBeInTheDocument();
  });

  it('shows upload results in the dialog when open', () => {
    render(
      <TrainingEvaluationsTab
        {...baseProps}
        uploadResultsOpen
        uploadResults={{ successful: [{ name: 'a.json', operation: 'created' }], failed: [] }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Upload Results' })).toBeInTheDocument();
    expect(screen.getByText('a.json')).toBeInTheDocument();
  });

  it('shows the LaTeX export dialog with code when open', () => {
    render(<TrainingEvaluationsTab {...baseProps} latexModalOpen latexCode="\begin{table}" />);

    expect(screen.getByText('Export Results as LaTeX')).toBeInTheDocument();
    expect(screen.getByText(/begin\{table\}/)).toBeInTheDocument();
  });
});
