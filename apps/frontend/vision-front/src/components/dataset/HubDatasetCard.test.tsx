import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

const service = vi.hoisted(() => ({ getHubInfo: vi.fn(), listLicenses: vi.fn() }));
vi.mock('../../services/datasetService', () => service);

import HubDatasetCard from './HubDatasetCard';
import { renderWithClient } from '../../test/renderWithClient';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const source = { provider: 'hf' as const, repo: 'acme/zod-png', revision: COMMIT };
const info = {
  repo: 'acme/zod-png', revision: COMMIT, license: 'cc-by-sa-4.0', tags: ['zod', 'lidar'], taskCategories: ['image-segmentation'],
  sizeCategories: ['10K<n<100K'], gated: false, fileCount: 3000, totalBytes: 5 * 1024 ** 3,
  folders: [{ path: 'train', files: 2500, bytes: 4 * 1024 ** 3 }, { path: 'val', files: 500, bytes: 1024 ** 3 }],
  files: Array.from({ length: 30 }, (_, i) => ({ path: `train/${i}.png`, size: 1024 })), truncated: true
};

describe('HubDatasetCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.listLicenses.mockResolvedValue([
      { id: 'cc-by-sa-4.0', name: 'CC BY-SA 4.0' },
      { id: 'other', name: 'Other' }
    ]);
  });

  it('shows the licence, size, tags and folders read from the Hub, and links the repo at its commit', async () => {
    service.getHubInfo.mockResolvedValue(info);
    renderWithClient(<HubDatasetCard datasetId="d1" source={source} />);
    expect(await screen.findByText('Hub card licence: cc-by-sa-4.0')).toBeInTheDocument();
    expect(screen.getByText('3,000 files · 5.0 GB')).toBeInTheDocument();
    expect(screen.getByText('image-segmentation')).toBeInTheDocument();
    expect(screen.getByText('zod')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'acme/zod-png' })).toHaveAttribute('href', `https://huggingface.co/datasets/acme/zod-png/tree/${COMMIT}`);
    const folders = screen.getByLabelText('Top-level folders');
    expect(folders).toHaveTextContent('train · 2,500 files · 4.0 GB');
    expect(folders).toHaveTextContent('val · 500 files · 1.0 GB');
    expect(service.getHubInfo).toHaveBeenCalledWith('d1');
  });

  it('lists the first files on request and says the rest are on the Hub', async () => {
    service.getHubInfo.mockResolvedValue(info);
    renderWithClient(<HubDatasetCard datasetId="d1" source={source} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show files' }));
    expect(screen.getByLabelText('Files').children).toHaveLength(20);
    expect(screen.getByText(/First 20 of 3,000 files/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide files' }));
  });

  it('flags a gated repo and handles one with no files or folders', async () => {
    service.getHubInfo.mockResolvedValue({ ...info, gated: true, folders: [], files: [], taskCategories: undefined, sizeCategories: undefined, license: undefined });
    renderWithClient(<HubDatasetCard datasetId="d1" source={source} />);
    expect(await screen.findByText('Gated: access must be requested')).toBeInTheDocument();
    expect(screen.queryByLabelText('Top-level folders')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show files' })).not.toBeInTheDocument();
  });

  it('says why a private or missing repo cannot be shown, without failing the page', async () => {
    service.getHubInfo.mockRejectedValue(new Error('This repo or commit is not on the Hub, or it is private. Only public repos can be shown here.'));
    renderWithClient(<HubDatasetCard datasetId="d1" source={source} />);
    expect(await screen.findByText(/or it is private/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'acme/zod-png' })).toBeInTheDocument();
  });

  describe('the licence the Hub card states', () => {
    it('is never copied over: with none declared it says so, and offers to declare it to someone who may edit', async () => {
      service.getHubInfo.mockResolvedValue(info);
      const onUseLicense = vi.fn();
      renderWithClient(<HubDatasetCard datasetId="d1" source={source} onUseLicense={onUseLicense} />);
      expect(await screen.findByText(/this dataset still has no declared licence/)).toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: 'Declare this licence' }));
      expect(onUseLicense).toHaveBeenCalledWith('cc-by-sa-4.0');
    });

    it('offers nothing to someone who may not edit, and nothing for a licence Visin does not list', async () => {
      service.getHubInfo.mockResolvedValue(info);
      const first = renderWithClient(<HubDatasetCard datasetId="d1" source={source} />);
      expect(await screen.findByText(/this dataset still has no declared licence/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Declare this licence' })).not.toBeInTheDocument();
      first.unmount();

      service.getHubInfo.mockResolvedValue({ ...info, license: 'gemma' });
      renderWithClient(<HubDatasetCard datasetId="d1" source={source} onUseLicense={vi.fn()} />);
      expect(await screen.findByText(/The Hub card says gemma/)).toBeInTheDocument();
      expect(service.listLicenses).toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Declare this licence' })).not.toBeInTheDocument();
    });

    it('warns when it differs from the declared one, and is quiet when they agree', async () => {
      service.getHubInfo.mockResolvedValue(info);
      const differing = renderWithClient(<HubDatasetCard datasetId="d1" source={source} declaredLicenseId="mit" />);
      expect(await screen.findByText(/differs from the licence declared for this dataset/)).toBeInTheDocument();
      differing.unmount();

      renderWithClient(<HubDatasetCard datasetId="d1" source={source} declaredLicenseId="cc-by-sa-4.0" />);
      expect(await screen.findByText('Hub card licence: cc-by-sa-4.0')).toBeInTheDocument();
      expect(screen.queryByText(/differs from/)).not.toBeInTheDocument();
      expect(screen.queryByText(/still has no declared licence/)).not.toBeInTheDocument();
    });
  });
});
