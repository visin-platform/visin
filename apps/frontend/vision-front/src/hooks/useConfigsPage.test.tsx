import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/configService', () => ({
  configService: {
    getAllConfigs: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
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

  it('handleEditClick prefills the edit form', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleEditClick(makeConfig('c1', 'My Config'));
    });

    expect(result.current.editDialogOpen).toBe(true);
    expect(result.current.editConfigName).toBe('My Config');
  });

  it('handleEditSave updates the config and shows a success message', async () => {
    mockedConfig.updateConfig.mockResolvedValue({ success: true, data: makeConfig('c1') });
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleEditClick(makeConfig('c1', 'Old'));
    });
    act(() => {
      result.current.setEditConfigName('New Name');
    });

    await act(async () => {
      await result.current.handleEditSave();
    });

    await waitFor(() => expect(result.current.success).toBe('Config name updated successfully!'));
    expect(mockedConfig.updateConfig).toHaveBeenCalledWith('c1', { config_name: 'New Name' });
  });

  it('handleEditSave sets an error message when the update fails', async () => {
    mockedConfig.updateConfig.mockRejectedValue(new Error('update failed'));
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleEditClick(makeConfig('c1'));
    });

    await act(async () => {
      await result.current.handleEditSave();
    });

    await waitFor(() => expect(result.current.error).toBe('update failed'));
  });

  it('handleDeleteClick opens the dialog, handleConfirmDelete deletes on confirm', async () => {
    mockedConfig.deleteConfig.mockResolvedValue({ success: true, data: undefined });
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleDeleteClick('c1');
    });
    expect(result.current.deleteDialogOpen).toBe(true);

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    await waitFor(() => expect(result.current.success).toBe('Config deleted successfully!'));
    expect(mockedConfig.deleteConfig).toHaveBeenCalledWith('c1');
  });

  it('handleSelectConfig toggles selection and handleSelectAll selects/clears all', async () => {
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleSelectConfig('c1');
    });
    expect(result.current.selectedConfigIds.has('c1')).toBe(true);

    act(() => {
      result.current.handleSelectConfig('c1');
    });
    expect(result.current.selectedConfigIds.has('c1')).toBe(false);

    act(() => {
      result.current.handleSelectAll();
    });
    expect(result.current.selectedConfigIds.size).toBe(2);

    act(() => {
      result.current.handleSelectAll();
    });
    expect(result.current.selectedConfigIds.size).toBe(0);
  });

  it('handleDeleteSelected deletes each selected config and reports the count', async () => {
    mockedConfig.deleteConfig.mockResolvedValue({ success: true, data: undefined });
    const { result } = renderHook(() => useConfigsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleSelectAll();
    });

    await act(async () => {
      await result.current.handleDeleteSelected();
    });

    await waitFor(() => expect(result.current.success).toBe('2 config(s) deleted successfully!'));
    expect(mockedConfig.deleteConfig).toHaveBeenCalledTimes(2);
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
      Summary: 'sum',
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
