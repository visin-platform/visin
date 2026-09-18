import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ImportMappingDialog from './ImportMappingDialog';
import type { ContentsFolder, DatasetContents } from '../../services/datasetService';

const folder = (path: string, images: number, jsons = 0): ContentsFolder => ({
  path, depth: path === '' ? 0 : path.split('/').length, files: images + jsons, images, jsons, bytes: 0
});
const contents: DatasetContents = {
  entries: 12,
  totalBytes: 4096,
  truncated: true,
  folders: [folder('', 4, 1), folder('annotations', 2, 1), folder('annotations/verify', 2, 1), folder('frames', 2), folder('lidar', 0)],
  extensions: [{ ext: '.csv', files: 1, bytes: 10 }]
};

describe('ImportMappingDialog', () => {
  it('starts from the suggestion and sends the edited mapping', () => {
    const onConfirm = vi.fn();
    render(<ImportMappingDialog open contents={contents} busy={false} error="Import refused" onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText('Import refused')).toBeInTheDocument();
    expect(screen.getByText(/only the shallowest are listed/)).toBeInTheDocument();
    expect(screen.queryByText('lidar')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Include annotations/verify')).toBeChecked();
    expect(screen.getByLabelText('Include frames')).toBeChecked();
    expect(screen.getByLabelText('Include (zip root)')).not.toBeChecked();

    fireEvent.change(screen.getByLabelText('Group for frames'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /Import/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Group for frames'), { target: { value: 'camera' } });
    fireEvent.click(screen.getByLabelText('Include annotations/verify'));
    fireEvent.click(screen.getByLabelText('Include annotations'));
    fireEvent.change(screen.getByLabelText('Manifest file (optional)'), { target: { value: ' manifest.csv ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 groups' }));
    expect(onConfirm).toHaveBeenCalledWith({
      groups: [{ folder: 'frames', group: 'camera' }, { folder: 'annotations', group: 'annotations' }],
      manifest: 'manifest.csv'
    });
  });

  it('pre-fills a previous mapping, filters folders and maps the root', () => {
    const onConfirm = vi.fn();
    render(
      <ImportMappingDialog open contents={contents} previous={{ groups: [{ folder: 'frames', group: 'cam' }], manifest: 'm.csv' }} busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />
    );
    expect(screen.getByLabelText('Group for frames')).toHaveValue('cam');
    fireEvent.change(screen.getByLabelText('Filter folders'), { target: { value: 'nothing-like-this' } });
    expect(screen.getByText('No folder matches')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter folders'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Include frames'));
    fireEvent.click(screen.getByLabelText('Include (zip root)'));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 group' }));
    expect(onConfirm).toHaveBeenCalledWith({ groups: [{ folder: '', group: 'root' }], manifest: 'm.csv' });
  });

  it('explains an empty zip and a missing one', () => {
    const { rerender } = render(
      <ImportMappingDialog open contents={{ ...contents, truncated: false, folders: [folder('', 0)], extensions: [] }} busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.getByText('This zip holds no images or JSON files')).toBeInTheDocument();
    expect(screen.queryByLabelText('Manifest file (optional)')).not.toBeInTheDocument();
    rerender(<ImportMappingDialog open busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('Upload a zip first.')).toBeInTheDocument();
  });
});
