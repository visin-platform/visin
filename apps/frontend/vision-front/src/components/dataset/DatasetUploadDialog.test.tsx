import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DatasetUploadDialog from './DatasetUploadDialog';

const renderDialog = (props: Partial<React.ComponentProps<typeof DatasetUploadDialog>> = {}) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <DatasetUploadDialog
      open
      loading={false}
      title="Upload Dataset"
      submitLabel="Upload"
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, onCancel, ...utils };
};

const pickFile = (name = 'waymo-v2.zip') => {
  const input = screen.getByTestId('dataset-file-input');
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'application/zip' })] } });
};

describe('DatasetUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers no size, download URL, or storage path controls', () => {
    renderDialog({ fileRequired: true });

    expect(screen.queryByRole('textbox', { name: /size/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /download url/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/storage path/i)).not.toBeInTheDocument();
  });

  it('names the dataset after the chosen file when the name is left blank', () => {
    const { onSubmit } = renderDialog({ fileRequired: true });

    pickFile();
    expect(screen.getByRole('textbox', { name: /dataset name/i })).toHaveValue('waymo-v2');

    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(onSubmit).toHaveBeenCalledWith('waymo-v2', expect.any(File));
  });

  it('keeps a name the user already typed when a file is chosen', () => {
    const { onSubmit } = renderDialog({ fileRequired: true });

    fireEvent.change(screen.getByRole('textbox', { name: /dataset name/i }), { target: { value: 'my-name' } });
    pickFile();

    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(onSubmit).toHaveBeenCalledWith('my-name', expect.any(File));
  });

  it('requires a file when creating', () => {
    const { onSubmit } = renderDialog({ fileRequired: true });

    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    expect(screen.getByText('Choose a dataset file to upload')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a rename with no file when editing', () => {
    const { onSubmit } = renderDialog({ initialName: 'Dataset Alpha', submitLabel: 'Save', title: 'Edit Dataset' });

    fireEvent.change(screen.getByRole('textbox', { name: /dataset name/i }), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSubmit).toHaveBeenCalledWith('Renamed', undefined);
  });

  it('rejects a name shorter than two characters', () => {
    const { onSubmit } = renderDialog({ initialName: 'Dataset Alpha' });

    fireEvent.change(screen.getByRole('textbox', { name: /dataset name/i }), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    expect(screen.getByText('Dataset name must be at least 2 characters')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks cancelling while an upload is in flight', () => {
    const { onCancel } = renderDialog({ loading: true });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
