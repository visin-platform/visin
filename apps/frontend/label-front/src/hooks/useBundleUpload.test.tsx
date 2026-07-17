import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/bundleService', () => ({
  getUploadUrl: vi.fn(),
  uploadZip: vi.fn(),
  startImport: vi.fn(),
  getImport: vi.fn(),
}));

import { getImport, getUploadUrl, startImport, uploadZip } from '../services/bundleService';
import { useBundleUpload } from './useBundleUpload';

const mockedGetUploadUrl = getUploadUrl as ReturnType<typeof vi.fn>;
const mockedUploadZip = uploadZip as ReturnType<typeof vi.fn>;
const mockedStartImport = startImport as ReturnType<typeof vi.fn>;
const mockedGetImport = getImport as ReturnType<typeof vi.fn>;

const file = new File(['zip'], 'bundle.zip');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockedGetUploadUrl.mockResolvedValue({ uploadUrl: 'http://signed', zipFileId: 'zip-1', expiresMs: 1 });
  mockedUploadZip.mockImplementation(async (_url, _file, onProgress) => onProgress(0.5));
  mockedStartImport.mockResolvedValue({ _id: 'i1', status: 'running', processed: 0, skipped: 0, fileErrors: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBundleUpload', () => {
  it('runs upload → import → poll to done', async () => {
    mockedGetImport
      .mockResolvedValueOnce({ _id: 'i1', status: 'running', processed: 40, skipped: 0, fileErrors: [] })
      .mockResolvedValueOnce({ _id: 'i1', status: 'done', processed: 100, skipped: 0, fileErrors: [] });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useBundleUpload('b1', onFinished));

    await act(() => result.current.start(file));

    expect(mockedUploadZip).toHaveBeenCalledWith('http://signed', file, expect.any(Function));
    expect(mockedStartImport).toHaveBeenCalledWith('b1', 'zip-1');
    expect(result.current.state.phase).toBe('importing');

    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(result.current.state.importJob?.processed).toBe(40);

    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(result.current.state.phase).toBe('done');
    expect(onFinished).toHaveBeenCalled();
  });

  it('surfaces a failed import', async () => {
    mockedGetImport.mockResolvedValue({ _id: 'i1', status: 'failed', processed: 0, skipped: 0, fileErrors: [{ path: '(zip)', reason: 'bad' }] });
    const { result } = renderHook(() => useBundleUpload('b1'));

    await act(() => result.current.start(file));
    await act(() => vi.advanceTimersByTimeAsync(2100));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.importJob?.fileErrors[0].reason).toBe('bad');
  });

  it('fails fast when the upload itself dies', async () => {
    mockedUploadZip.mockRejectedValue(new Error('cancelled'));
    const { result } = renderHook(() => useBundleUpload('b1'));

    await act(() => result.current.start(file));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('cancelled');
    expect(mockedStartImport).not.toHaveBeenCalled();
  });

  it('fails when polling errors out', async () => {
    mockedGetImport.mockRejectedValue(new Error('poll boom'));
    const { result } = renderHook(() => useBundleUpload('b1'));

    await act(() => result.current.start(file));
    await act(() => vi.advanceTimersByTimeAsync(2100));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('poll boom');
  });
});
