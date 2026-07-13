import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DatasetInfoTab from './DatasetInfoTab';
import type { DatasetAnalysis } from '../../services/analysisService';

const makeAnalysis = (overrides: Partial<DatasetAnalysis> = {}): DatasetAnalysis => ({
  _id: 'a1',
  dataset: 'ds1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: { foo: 'bar' },
  ...overrides,
});

const baseProps = {
  analysis: makeAnalysis(),
  canDelete: true,
  onUploadJson: vi.fn(),
  uploadingJson: false,
  jsonError: null,
  jsonSuccess: null,
};

describe('DatasetInfoTab', () => {
  it('renders the analysis data as formatted JSON', () => {
    render(<DatasetInfoTab {...baseProps} />);

    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
  });

  it('falls back to the legacy top-level data shape when analysis.data is absent', () => {
    const legacyAnalysis = { ...makeAnalysis({ data: undefined }), legacyField: 'value' } as DatasetAnalysis;
    render(<DatasetInfoTab {...baseProps} analysis={legacyAnalysis} />);

    expect(screen.getByText(/"legacyField": "value"/)).toBeInTheDocument();
  });

  it('toggles expand/collapse label', () => {
    render(<DatasetInfoTab {...baseProps} />);

    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument();
  });

  it('hides the upload button when canDelete is false', () => {
    render(<DatasetInfoTab {...baseProps} canDelete={false} />);

    expect(screen.queryByRole('button', { name: /upload json/i })).not.toBeInTheDocument();
  });

  it('shows "Uploading..." and disables the button while uploading', () => {
    render(<DatasetInfoTab {...baseProps} uploadingJson />);

    const button = screen.getByRole('button', { name: /uploading/i });
    expect(button).toBeDisabled();
  });

  it('shows error and success alerts', () => {
    const { rerender } = render(<DatasetInfoTab {...baseProps} jsonError="Bad JSON" />);
    expect(screen.getByText('Bad JSON')).toBeInTheDocument();

    rerender(<DatasetInfoTab {...baseProps} jsonError={null} jsonSuccess="Uploaded!" />);
    expect(screen.getByText('Uploaded!')).toBeInTheDocument();
  });

  it('triggers the hidden file input when Upload JSON is clicked', () => {
    render(<DatasetInfoTab {...baseProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(screen.getByRole('button', { name: /upload json/i }));

    expect(clickSpy).toHaveBeenCalled();
  });

  it('calls onUploadJson when a file is selected', () => {
    const onUploadJson = vi.fn();
    render(<DatasetInfoTab {...baseProps} onUploadJson={onUploadJson} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [new File(['{}'], 'a.json', { type: 'application/json' })] } });

    expect(onUploadJson).toHaveBeenCalledTimes(1);
  });
});
