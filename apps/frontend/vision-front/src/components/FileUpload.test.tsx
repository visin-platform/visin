import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FileUpload from './FileUpload';
import { getUploadSignedUrl, uploadFileToSignedUrl, createDatasetImage } from '../services/datasetImageService';
import { getCategoriesByDataset } from '../services/imageCategoryService';

vi.mock('../services/datasetImageService', () => ({
  getUploadSignedUrl: vi.fn(),
  uploadFileToSignedUrl: vi.fn(),
  createDatasetImage: vi.fn()
}));

vi.mock('../services/imageCategoryService', () => ({
  getCategoriesByDataset: vi.fn()
}));

const mockedGetUploadSignedUrl = vi.mocked(getUploadSignedUrl);
const mockedUploadFileToSignedUrl = vi.mocked(uploadFileToSignedUrl);
const mockedCreateDatasetImage = vi.mocked(createDatasetImage);
const mockedGetCategoriesByDataset = vi.mocked(getCategoriesByDataset);

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderComponent = (props: Partial<React.ComponentProps<typeof FileUpload>> = {}) => {
  const qc = makeQueryClient();
  const defaultProps = {
    datasetId: 'd1',
    open: true,
    onClose: vi.fn(),
    onUploadComplete: vi.fn()
  };
  return {
    props: { ...defaultProps, ...props },
    ...render(
      <QueryClientProvider client={qc}>
        <FileUpload {...defaultProps} {...props} />
      </QueryClientProvider>
    )
  };
};

describe('FileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCategoriesByDataset.mockResolvedValue([]);
  });

  it('does not render dialog content when closed', () => {
    renderComponent({ open: false });
    expect(screen.queryByText('Upload Example Images')).not.toBeInTheDocument();
  });

  it('renders the upload dialog when open', async () => {
    renderComponent();
    expect(screen.getByText('Upload Example Images')).toBeInTheDocument();
    expect(screen.getByText('Drop images here or click to select')).toBeInTheDocument();
  });

  it('renders categories in the select when available', async () => {
    mockedGetCategoriesByDataset.mockResolvedValue([
      { _id: 'c1', name: 'Cars', color: '#ff0000', datasetId: 'd1' } as any
    ]);
    renderComponent();
    await waitFor(() => {
      expect(mockedGetCategoriesByDataset).toHaveBeenCalledWith('d1');
    });
  });

  it('adds a selected image file to the list', () => {
    renderComponent();
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('#file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('Selected Files (1)')).toBeInTheDocument();
    expect(screen.getByText('test.jpg')).toBeInTheDocument();
  });

  it('shows an error and filters out non-image files', () => {
    renderComponent();
    const imageFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    const textFile = new File(['content'], 'notes.txt', { type: 'text/plain' });
    const input = document.querySelector('#file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [imageFile, textFile] } });

    expect(screen.getByText('Only image files are allowed')).toBeInTheDocument();
    expect(screen.getByText('Selected Files (1)')).toBeInTheDocument();
  });

  it('removes a file from the list', () => {
    renderComponent();
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('#file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('Selected Files (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(screen.queryByText('Selected Files (1)')).not.toBeInTheDocument();
  });

  it('disables the upload button when there are no files selected', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /upload 0 images/i })).toBeDisabled();
  });

  it('uploads selected files and calls onUploadComplete on success', async () => {
    mockedGetUploadSignedUrl.mockResolvedValue({
      uploadUrl: 'https://minio/upload',
      minioFileId: 'minio-1'
    } as any);
    mockedUploadFileToSignedUrl.mockResolvedValue(undefined as any);
    mockedCreateDatasetImage.mockResolvedValue({ _id: 'img1' } as any);

    const onUploadComplete = vi.fn();
    const onClose = vi.fn();
    renderComponent({ onUploadComplete, onClose });

    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('#file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /upload 1 image/i }));

    await waitFor(() => {
      expect(mockedCreateDatasetImage).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error message when upload fails', async () => {
    mockedGetUploadSignedUrl.mockRejectedValue(new Error('signed url failed'));

    renderComponent();
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('#file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /upload 1 image/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to upload test\.jpg/)).toBeInTheDocument();
    });
  });

  it('closes the dialog via cancel when not uploading', () => {
    const onClose = vi.fn();
    renderComponent({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('handles a drop event by adding image files', () => {
    renderComponent();
    const dropZone = screen.getByText('Drop images here or click to select').closest('div')!;
    const file = new File(['content'], 'dropped.jpg', { type: 'image/jpeg' });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] }
    });

    expect(screen.getByText('Selected Files (1)')).toBeInTheDocument();
    expect(screen.getByText('dropped.jpg')).toBeInTheDocument();
  });
});
