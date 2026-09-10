import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/configService', () => ({
  configService: {
    getAllConfigs: vi.fn(),
    uploadConfig: vi.fn()
  }
}));

import { configService } from '../services/configService';
import { useConfigsPage } from './useConfigsPage';

const mockedConfig = vi.mocked(configService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const makeConfig = (id: string, name = 'cfg') => ({ _id: id, config_name: name } as any);

describe('useConfigsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConfig.getAllConfigs.mockResolvedValue({
      success: true,
      data: { configs: [makeConfig('c1'), makeConfig('c2')], pagination: {} as any }
    });
  });

  it('loads configs on mount', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.configs).toHaveLength(2);
  });

  it('handleViewDetails opens the details dialog with the selected config', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleViewDetails(makeConfig('c1'));
    });

    expect(result.current.detailsDialogOpen).toBe(true);
    expect(result.current.selectedConfig?._id).toBe('c1');
  });

  // A config records what a run used, so the page only reads: no rename, no
  // delete, no row selection. The service has no method for any of them.
  it('exposes no edit, delete or selection surface', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    for (const key of [
      'handleEditClick',
      'handleEditSave',
      'handleDeleteClick',
      'handleConfirmDelete',
      'handleSelectConfig',
      'handleSelectAll',
      'handleDeleteSelected',
      'selectedConfigIds'
    ]) {
      expect(result.current).not.toHaveProperty(key);
    }
  });

  it('handleFileChange sets an error when no files are provided', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleFileChange({ target: { files: null } } as any);
    });

    expect(result.current.error).toBe('No files selected');
  });

  it('handleFileChange uploads each JSON file and reports a success count', async () => {
    mockedConfig.uploadConfig.mockResolvedValue({ success: true, data: makeConfig('c3') });
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File([JSON.stringify({ Summary: 'sum' })], 'my-config.json', { type: 'application/json' });
    const fileList = { 0: file, length: 1, item: () => file } as unknown as FileList;

    await act(async () => {
      await result.current.handleFileChange({ target: { files: fileList } } as any);
    });

    expect(mockedConfig.uploadConfig).toHaveBeenCalledWith({
      config_data: { Summary: 'sum' },
      summary: 'sum',
      config_name: 'my-config'
    });
    await waitFor(() => expect(result.current.success).toBe('Upload finished - 1 config(s) processed'));
  });

  it('handleFileChange collects per-file errors without failing the whole batch', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const badFile = new File(['not json'], 'bad.json', { type: 'application/json' });
    const fileList = { 0: badFile, length: 1, item: () => badFile } as unknown as FileList;

    await act(async () => {
      await result.current.handleFileChange({ target: { files: fileList } } as any);
    });

    expect(result.current.error).toContain('bad.json');
  });

  it('handleRefresh calls loadConfigs (refetch)', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedConfig.getAllConfigs.mockClear();
    act(() => {
      result.current.handleRefresh();
    });

    await waitFor(() => expect(mockedConfig.getAllConfigs).toHaveBeenCalled());
  });
});
