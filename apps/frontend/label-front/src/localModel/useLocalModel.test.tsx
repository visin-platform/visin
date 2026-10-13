import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  getInfo: vi.fn(),
  detect: vi.fn(),
  segment: vi.fn()
}));

import { ModelError, detect, getInfo, segment } from './client';
import { useLocalModel } from './useLocalModel';

const info = getInfo as ReturnType<typeof vi.fn>;
const detectCall = detect as ReturnType<typeof vi.fn>;
const segmentCall = segment as ReturnType<typeof vi.fn>;

const INFO = { name: 'visin-infer', version: '0.1.0', device: 'RTX 4070', classes: ['car'], supports: { detect: true, segment: true } };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('useLocalModel', () => {
  it('ignores a failed call to a server that has been replaced', async () => {
    info.mockResolvedValue(INFO);
    let rejectOld: (error: Error) => void = () => undefined;
    detectCall.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const { result } = renderHook(() => useLocalModel());
    await act(async () => { await result.current.connect({ url: 'http://one:8000' }); });
    let oldCall: Promise<unknown>;
    act(() => { oldCall = result.current.detect(new Blob(['x'])); });
    const assertion = expect(oldCall!).rejects.toThrow('old server');
    await act(async () => { await result.current.connect({ url: 'http://two:8000' }); });
    await act(async () => {
      rejectOld(new ModelError('unreachable', 'old server'));
      await assertion;
    });
    expect(result.current.status).toBe('connected');
    expect(result.current.error).toBeNull();
  });

  it('is off until an address is set, and does not call out', () => {
    const { result } = renderHook(() => useLocalModel());

    expect(result.current.status).toBe('off');
    expect(result.current.canDetect).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it('connects, remembers the address, and says what the model can do', async () => {
    info.mockResolvedValue(INFO);
    const { result } = renderHook(() => useLocalModel());

    let ok = false;
    await act(async () => {
      ok = await result.current.connect({ url: 'localhost:8000', token: 'abc' });
    });

    expect(ok).toBe(true);
    expect(result.current.status).toBe('connected');
    expect(result.current.info?.device).toBe('RTX 4070');
    expect(result.current.canDetect && result.current.canSegment).toBe(true);
    expect(info).toHaveBeenCalledWith({ url: 'http://localhost:8000', token: 'abc' });
    expect(JSON.parse(window.localStorage.getItem('visin-label-local-model')!)).toMatchObject({
      url: 'http://localhost:8000',
      token: 'abc'
    });
  });

  it('connects again on the next visit by itself', async () => {
    window.localStorage.setItem('visin-label-local-model', JSON.stringify({ url: 'http://localhost:8000' }));
    info.mockResolvedValue({ ...INFO, supports: { detect: true, segment: false } });

    const { result } = renderHook(() => useLocalModel());

    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(result.current.canDetect).toBe(true);
    expect(result.current.canSegment).toBe(false);
  });

  it('says it is unreachable, and keeps the address for another try', async () => {
    info.mockRejectedValue(new ModelError('unreachable', 'Could not reach the model server at http://localhost:8000'));
    const { result } = renderHook(() => useLocalModel());

    let ok = true;
    await act(async () => {
      ok = await result.current.connect({ url: 'http://localhost:8000' });
    });

    expect(ok).toBe(false);
    expect(result.current.status).toBe('unreachable');
    expect(result.current.error).toMatch(/Could not reach/);
    expect(result.current.settings.url).toBe('http://localhost:8000');
    expect(result.current.canDetect).toBe(false);
  });

  it('forgets the address on disconnect', async () => {
    info.mockResolvedValue(INFO);
    const { result } = renderHook(() => useLocalModel());
    await act(async () => {
      await result.current.connect({ url: 'http://localhost:8000', token: 'abc' });
    });

    act(() => result.current.disconnect());

    expect(result.current.status).toBe('off');
    expect(result.current.settings).toMatchObject({ url: '', token: undefined });
    expect(result.current.info).toBeNull();
  });

  it('connecting with a blank address leaves it off', async () => {
    const { result } = renderHook(() => useLocalModel());

    let ok = true;
    await act(async () => {
      ok = await result.current.connect({ url: '   ' });
    });

    expect(ok).toBe(false);
    expect(result.current.status).toBe('off');
    expect(info).not.toHaveBeenCalled();
  });

  it('ignores the answer to a connect that has been replaced', async () => {
    let release: (value: unknown) => void = () => undefined;
    info.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    info.mockResolvedValueOnce({ ...INFO, device: 'second' });
    const { result } = renderHook(() => useLocalModel());

    let first: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.connect({ url: 'http://one:8000' });
    });
    await act(async () => {
      await result.current.connect({ url: 'http://two:8000' });
    });
    await act(async () => {
      release(INFO);
      await first;
    });

    expect(result.current.info?.device).toBe('second');
  });

  it('keeps settings changes without reconnecting', async () => {
    info.mockResolvedValue(INFO);
    const { result } = renderHook(() => useLocalModel());
    await act(async () => {
      await result.current.connect({ url: 'http://localhost:8000' });
    });

    act(() => result.current.update({ autoDetect: false, minScore: 0.6 }));

    expect(result.current.settings).toMatchObject({ autoDetect: false, minScore: 0.6 });
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('detects and segments with the saved address and threshold', async () => {
    info.mockResolvedValue(INFO);
    detectCall.mockResolvedValue([{ bbox: [0, 0, 1, 1], class: 'car', score: 0.9 }]);
    segmentCall.mockResolvedValue({ rle: new Uint8Array(), width: 1, height: 1, bbox: [0, 0, 0, 0], score: 1 });
    const { result } = renderHook(() => useLocalModel());
    await act(async () => {
      await result.current.connect({ url: 'http://localhost:8000', minScore: 0.5 });
    });
    const image = new Blob(['x']);

    await act(async () => {
      await result.current.detect(image);
      await result.current.segment({ imageId: 't', points: [] });
    });

    expect(detectCall).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://localhost:8000' }), image, 0.5);
    expect(segmentCall).toHaveBeenCalled();
  });

  it('shows the model as unreachable when it goes away mid-session, but not for other failures', async () => {
    info.mockResolvedValue(INFO);
    const { result } = renderHook(() => useLocalModel());
    await act(async () => {
      await result.current.connect({ url: 'http://localhost:8000' });
    });

    detectCall.mockRejectedValueOnce(new ModelError('server', 'RuntimeError'));
    await act(async () => {
      await expect(result.current.detect(new Blob(['x']))).rejects.toThrow('RuntimeError');
    });
    expect(result.current.status).toBe('connected');

    detectCall.mockRejectedValueOnce(new ModelError('unreachable', 'Could not reach'));
    await act(async () => {
      await expect(result.current.detect(new Blob(['x']))).rejects.toThrow('Could not reach');
    });
    expect(result.current.status).toBe('unreachable');

    segmentCall.mockRejectedValueOnce(new Error('plain'));
    await act(async () => {
      await expect(result.current.segment({ imageId: 't', points: [] })).rejects.toThrow('plain');
    });
  });

  it('works when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    info.mockResolvedValue(INFO);
    const { result } = renderHook(() => useLocalModel());

    await act(async () => {
      await result.current.connect({ url: 'http://localhost:8000' });
    });

    expect(result.current.status).toBe('connected');
  });
});
