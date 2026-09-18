import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

const uploadArchive = vi.hoisted(() => vi.fn());
vi.mock('../../services/datasetService', () => ({ uploadArchive }));

import UploadPanel from './UploadPanel';
import { renderWithClient } from '../../test/renderWithClient';
import { resetDatasetUploads, startUpload } from '../../services/datasetUploads';

const gib = 1024 ** 3;
const bigFile = () => {
  const file = new File(['zip'], 'zod.zip');
  Object.defineProperty(file, 'size', { value: 4 * gib });
  return file;
};

describe('UploadPanel', () => {
  beforeEach(() => {
    resetDatasetUploads();
    uploadArchive.mockReset();
  });

  it('shows nothing without uploads', () => {
    renderWithClient(<UploadPanel />);
    expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  it('shows a running upload in the corner, warns before leaving, and cancels', async () => {
    uploadArchive.mockImplementation(
      (_id: string, _file: File, onProgress: (n: number) => void, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          onProgress(0.25);
          signal.addEventListener('abort', () => reject(new Error('cancelled')));
        })
    );
    renderWithClient(<UploadPanel />);
    act(() => startUpload({ _id: 'd1', name: 'ZOD' }, bigFile(), new QueryClient()));

    expect(screen.getByText('Uploading 1 zip — keep this tab open')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ZOD' })).toHaveAttribute('href', '/datasets/d1');
    expect(screen.getByText('25% · 1.0 GB of 4.0 GB')).toBeInTheDocument();
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse uploads' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand uploads' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(await screen.findByText(/Stopped. Resume to continue/)).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();

    uploadArchive.mockResolvedValue({ _id: 'd1' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resume' })));
    expect(await screen.findByText(/Uploaded — its contents are being read/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss zod.zip' }));
    expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  it('shows why an upload failed', async () => {
    uploadArchive.mockRejectedValue(new Error('Failed to upload dataset file (403)'));
    renderWithClient(<UploadPanel />);
    await act(async () => startUpload({ _id: 'd1', name: 'ZOD' }, bigFile(), new QueryClient()));
    expect(screen.getByText('Failed to upload dataset file (403)')).toBeInTheDocument();
  });
});
