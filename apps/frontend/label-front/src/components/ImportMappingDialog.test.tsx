import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import ImportMappingDialog from './ImportMappingDialog';
import { renderWithProviders } from '../test/renderWithProviders';
import { ZipFolderSummary, ZipPreview } from '../types';

const folder = (overrides: Partial<ZipFolderSummary> & { path: string }): ZipFolderSummary => ({
  files: 1,
  images: 0,
  idMaps: 0,
  maskFiles: 0,
  others: 0,
  samples: [],
  ...overrides,
});

const preview = (overrides: Partial<ZipPreview> = {}): ZipPreview => ({
  entries: 6,
  truncated: false,
  folders: [
    folder({ path: 'run7/img', files: 3, images: 3, samples: ['a.jpg'] }),
    folder({ path: 'run7/seg', files: 2, images: 1, idMaps: 1 }),
    folder({ path: 'run7/notes', files: 1, others: 1 }),
  ],
  manifestCandidates: ['run7/list.csv'],
  suggestion: {
    frames: 'run7/img',
    annotations: [{ path: 'run7/seg', set: 'seg' }],
    manifest: 'run7/list.csv',
  },
  ...overrides,
});

const pickRole = async (folderPath: string, role: string) => {
  fireEvent.mouseDown(screen.getByLabelText(`Role for ${folderPath}`));
  fireEvent.click(await screen.findByRole('option', { name: role }));
};

const render = (overrides: Partial<ZipPreview> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <ImportMappingDialog open preview={preview(overrides)} onCancel={onCancel} onConfirm={onConfirm} />
  );
  return { onConfirm, onCancel };
};

describe('ImportMappingDialog', () => {
  it('lists every folder with its contents and confirms the suggested mapping', () => {
    const { onConfirm } = render();

    expect(screen.getByText('run7/img')).toBeInTheDocument();
    expect(screen.getByText('3 image')).toBeInTheDocument();
    expect(screen.getByText('1 image · 1 id map')).toBeInTheDocument();
    expect(screen.getByText('1 other')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(onConfirm).toHaveBeenCalledWith({
      frames: 'run7/img',
      annotations: [{ path: 'run7/seg', set: 'seg' }],
      manifest: 'run7/list.csv',
    });
  });

  it('re-points frames at another folder, releasing the previous one', async () => {
    const { onConfirm } = render();

    await pickRole('run7/notes', 'Frames');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ frames: 'run7/notes', annotations: [{ path: 'run7/seg', set: 'seg' }] })
    );
  });

  it('renames an annotation set and drops an ignored folder', async () => {
    const { onConfirm } = render();

    fireEvent.change(screen.getByLabelText('Set name for run7/seg'), { target: { value: 'sam' } });
    await pickRole('run7/notes', 'Annotations');
    await pickRole('run7/notes', 'Ignore');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ annotations: [{ path: 'run7/seg', set: 'sam' }] })
    );
  });

  it('blocks import until a frames folder is chosen', async () => {
    render({ suggestion: { frames: 'nowhere', annotations: [] } });

    expect(screen.getByText('Pick the folder holding the frames to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

    await pickRole('run7/img', 'Frames');
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
  });

  it('blocks import while an annotation set has no name', () => {
    render();

    fireEvent.change(screen.getByLabelText('Set name for run7/seg'), { target: { value: '  ' } });

    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('sends custom file-name suffixes but omits the defaults', () => {
    const { onConfirm } = render();

    fireEvent.change(screen.getByLabelText('Id map suffix'), { target: { value: '_id.png' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    const mapping = onConfirm.mock.calls[0][0];
    expect(mapping.idsSuffix).toBe('_id.png');
    expect(mapping.masksSuffix).toBeUndefined();
  });

  it('clears the manifest selection', async () => {
    const { onConfirm } = render();

    fireEvent.mouseDown(screen.getByLabelText('Manifest file'));
    fireEvent.click(await screen.findByRole('option', { name: 'None' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(onConfirm.mock.calls[0][0].manifest).toBeUndefined();
  });

  it('maps frames sitting at the zip root and warns when folders are truncated', () => {
    const { onConfirm } = render({
      truncated: true,
      folders: [folder({ path: '', files: 2, images: 2 })],
      manifestCandidates: [],
      suggestion: { frames: '', annotations: [] },
    });

    expect(screen.getByText('(zip root)')).toBeInTheDocument();
    expect(screen.getByText(/Only the first 1 folders are listed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(onConfirm).toHaveBeenCalledWith({ frames: '', annotations: [] });
  });

  it('cancels without importing', () => {
    const { onCancel, onConfirm } = render();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
