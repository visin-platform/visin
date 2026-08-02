import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/bundleService', () => ({
  getUploadUrl: vi.fn(),
  uploadZip: vi.fn(),
  previewImport: vi.fn(),
  startImport: vi.fn(),
  getImport: vi.fn(),
}));

import { getImport, getUploadUrl, previewImport, startImport, uploadZip } from '../services/bundleService';
import { useBundleUpload } from './useBundleUpload';

const mockedGetUploadUrl = getUploadUrl as ReturnType<typeof vi.fn>;
const mockedUploadZip = uploadZip as ReturnType<typeof vi.fn>;
const mockedPreview = previewImport as ReturnType<typeof vi.fn>;
const mockedStartImport = startImport as ReturnType<typeof vi.fn>;
const mockedGetImport = getImport as ReturnType<typeof vi.fn>;

const file = new File(['zip'], 'bundle.zip');
const mapping = { frames: 'frames', annotations: [{ path: 'annotations/llava', set: 'llava' }] };
const preview = {
  entries: 3,
  truncated: false,
  folders: [],
  manifestCandidates: [],
  suggestion: mapping,
};

/** Upload + inspect, leaving the hook parked on the mapping step. */
const uploadTo = async (result: { current: ReturnType<typeof useBundleUpload> }) => {
  await act(() => result.current.start(file));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockedGetUploadUrl.mockResolvedValue({ uploadUrl: 'http://signed', zipFileId: 'zip-1', expiresMs: 1 });
  mockedUploadZip.mockImplementation(async (_url, _file, onProgress) => onProgress(0.5));
  mockedPreview.mockResolvedValue(preview);
  mockedStartImport.mockResolvedValue({ _id: 'i1', status: 'running', processed: 0, skipped: 0, fileErrors: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBundleUpload', () => {
  it('runs upload → inspect → confirmed mapping → poll to done', async () => {
    mockedGetImport
      .mockResolvedValueOnce({ _id: 'i1', status: 'running', processed: 40, skipped: 0, fileErrors: [] })
      .mockResolvedValueOnce({ _id: 'i1', status: 'done', processed: 100, skipped: 0, fileErrors: [] });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useBundleUpload('b1', onFinished));

    await uploadTo(result);

    expect(mockedUploadZip).toHaveBeenCalledWith('http://signed', file, expect.any(Function));
    expect(mockedPreview).toHaveBeenCalledWith('b1', 'zip-1');
    // Nothing is imported until the mapping is confirmed.
    expect(result.current.state.phase).toBe('mapping');
    expect(result.current.state.preview).toEqual(preview);
    expect(mockedStartImport).not.toHaveBeenCalled();

    await act(() => result.current.confirm(mapping));

    expect(mockedStartImport).toHaveBeenCalledWith('b1', 'zip-1', mapping);
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

    await uploadTo(result);
    await act(() => result.current.confirm(mapping));
    await act(() => vi.advanceTimersByTimeAsync(2100));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.importJob?.fileErrors[0].reason).toBe('bad');
  });

  it('fails fast when the upload itself dies', async () => {
    mockedUploadZip.mockRejectedValue(new Error('cancelled'));
    const { result } = renderHook(() => useBundleUpload('b1'));

    await uploadTo(result);

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('cancelled');
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it('fails when the zip cannot be inspected', async () => {
    mockedPreview.mockRejectedValue(new Error('unreadable zip'));
    const { result } = renderHook(() => useBundleUpload('b1'));

    await uploadTo(result);

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('unreadable zip');
    expect(mockedStartImport).not.toHaveBeenCalled();
  });

  it('fails when starting the mapped import is rejected', async () => {
    mockedStartImport.mockRejectedValue(new Error('already running'));
    const { result } = renderHook(() => useBundleUpload('b1'));

    await uploadTo(result);
    await act(() => result.current.confirm(mapping));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('already running');
  });

  it('ignores a confirm with no uploaded zip behind it', async () => {
    const { result } = renderHook(() => useBundleUpload('b1'));

    await act(() => result.current.confirm(mapping));

    expect(mockedStartImport).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
  });

  it('cancelling the mapping step resets to idle without importing', async () => {
    const { result } = renderHook(() => useBundleUpload('b1'));

    await uploadTo(result);
    act(() => result.current.cancel());

    expect(result.current.state).toEqual({
      phase: 'idle',
      uploadFraction: 0,
      preview: null,
      importJob: null,
      error: null,
    });

    await act(() => result.current.confirm(mapping));
    expect(mockedStartImport).not.toHaveBeenCalled();
  });

  it('re-imports an existing upload without touching the upload path', async () => {
    const { result } = renderHook(() => useBundleUpload('b1'));

    await act(() => result.current.startFromUpload('label-bundles/b1/upload-9.zip'));

    // No signed URL, no PUT — straight to inspecting the zip already on the server.
    expect(mockedGetUploadUrl).not.toHaveBeenCalled();
    expect(mockedUploadZip).not.toHaveBeenCalled();
    expect(mockedPreview).toHaveBeenCalledWith('b1', 'label-bundles/b1/upload-9.zip');
    expect(result.current.state.phase).toBe('mapping');

    await act(() => result.current.confirm(mapping));
    expect(mockedStartImport).toHaveBeenCalledWith('b1', 'label-bundles/b1/upload-9.zip', mapping);
  });

  it('surfaces a failure while re-inspecting an existing upload', async () => {
    mockedPreview.mockRejectedValue(new Error('zip is gone'));
    const { result } = renderHook(() => useBundleUpload('b1'));

    await act(() => result.current.startFromUpload('label-bundles/b1/upload-9.zip'));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('zip is gone');
  });

  it('fails when polling errors out', async () => {
    mockedGetImport.mockRejectedValue(new Error('poll boom'));
    const { result } = renderHook(() => useBundleUpload('b1'));

    await uploadTo(result);
    await act(() => result.current.confirm(mapping));
    await act(() => vi.advanceTimersByTimeAsync(2100));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('poll boom');
  });
});
