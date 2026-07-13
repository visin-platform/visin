import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingTestResultsTab from './TrainingTestResultsTab';

const baseProps = {
  allTestResults: [],
  testResultsLoading: false,
  availableTestEpochs: [],
  uploading: false,
  uploadError: null as string | null,
  uploadSuccess: null as string | null,
  uploadResultsOpen: false,
  uploadResults: { successful: [], failed: [] },
  latexModalOpen: false,
  latexCode: '',
  onTestResultFileUpload: vi.fn(),
  onLatexExport: vi.fn(),
  onSetUploadResultsOpen: vi.fn(),
  onSetLatexModalOpen: vi.fn(),
  onDeleteTestResult: vi.fn(),
  isAuthenticated: true,
};

describe('TrainingTestResultsTab', () => {
  it('renders the header and the empty-state test results list', () => {
    render(<TrainingTestResultsTab {...baseProps} />);

    expect(screen.getByText('Test Results')).toBeInTheDocument();
    expect(screen.getByText('No test results found')).toBeInTheDocument();
  });

  it('shows an upload error alert that opens the results dialog', () => {
    const onSetUploadResultsOpen = vi.fn();
    render(
      <TrainingTestResultsTab
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
    render(<TrainingTestResultsTab {...baseProps} uploadSuccess="Uploaded 3 files" />);

    expect(screen.getByText('Uploaded 3 files')).toBeInTheDocument();
  });

  it('shows upload results in the dialog when open', () => {
    render(
      <TrainingTestResultsTab
        {...baseProps}
        uploadResultsOpen
        uploadResults={{ successful: [{ name: 'a.json', operation: 'created' }], failed: [] }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Upload Results' })).toBeInTheDocument();
    expect(screen.getByText('a.json')).toBeInTheDocument();
  });

  it('shows the LaTeX export dialog with code when open', () => {
    render(<TrainingTestResultsTab {...baseProps} latexModalOpen latexCode="\begin{table}" />);

    expect(screen.getByText('Export Results as LaTeX')).toBeInTheDocument();
    expect(screen.getByText(/begin\{table\}/)).toBeInTheDocument();
  });
});
