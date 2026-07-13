import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Table, TableBody } from '@mui/material';
import AnalysisTableRow from './AnalysisTableRow';
import type { DatasetAnalysis } from '../../services/analysisService';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const analysis: DatasetAnalysis = {
  _id: 'a1',
  dataset: 'My Dataset',
  size: '1.2 GB',
  data: {},
  downloadUrl: 'https://example.com/dl.zip',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z'
};

const baseProps = {
  analysis,
  isSelected: false,
  onSelect: vi.fn(),
  canEdit: true,
  canDelete: true,
  isDownloading: false,
  isDeleting: false,
  isEditing: false,
  onDownload: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn()
};

const renderRow = (props = {}) =>
  render(
    <MemoryRouter>
      <Table>
        <TableBody>
          <AnalysisTableRow {...baseProps} {...props} />
        </TableBody>
      </Table>
    </MemoryRouter>
  );

describe('AnalysisTableRow', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it('renders dataset name and size', () => {
    renderRow();
    expect(screen.getByText('My Dataset')).toBeInTheDocument();
    expect(screen.getByText('1.2 GB')).toBeInTheDocument();
  });

  it('shows "-" when size is missing', () => {
    renderRow({ analysis: { ...analysis, size: undefined } });
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('navigates to the dataset detail page when the row is clicked', () => {
    renderRow();
    fireEvent.click(screen.getByText('My Dataset'));
    expect(navigateMock).toHaveBeenCalledWith('/datasets/a1');
  });

  it('calls onSelect when the checkbox is clicked', () => {
    // The checkbox's onChange calls stopPropagation, but that only stops the
    // 'change' event, not the native 'click' bubbling up to the row's
    // onClick — so a checkbox click still triggers row navigation too.
    const onSelect = vi.fn();
    renderRow({ onSelect });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('calls onDownload when the download button is clicked', () => {
    const onDownload = vi.fn();
    renderRow({ onDownload });
    fireEvent.click(screen.getByRole('button', { name: /Download dataset/i }));
    expect(onDownload).toHaveBeenCalledWith(analysis);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not render the download button when downloadUrl is missing', () => {
    renderRow({ analysis: { ...analysis, downloadUrl: undefined } });
    expect(screen.queryByRole('button', { name: /Download dataset/i })).not.toBeInTheDocument();
  });

  it('calls onEdit when the edit button is clicked', () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    fireEvent.click(screen.getByRole('button', { name: /Edit dataset name/i }));
    expect(onEdit).toHaveBeenCalledWith(analysis);
  });

  it('hides edit button when canEdit is false', () => {
    renderRow({ canEdit: false });
    expect(screen.queryByRole('button', { name: /Edit dataset name/i })).not.toBeInTheDocument();
  });

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    renderRow({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: /Delete analysis/i }));
    expect(onDelete).toHaveBeenCalledWith(analysis);
  });

  it('hides delete button when canDelete is false', () => {
    renderRow({ canDelete: false });
    expect(screen.queryByRole('button', { name: /Delete analysis/i })).not.toBeInTheDocument();
  });
});
