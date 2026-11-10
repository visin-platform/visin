import { afterEach, describe, expect, it, vi } from 'vitest';
import { askWhich, canCaptureScreen, declined } from './screenCapture';

afterEach(() => Reflect.deleteProperty(navigator, 'mediaDevices'));

describe('screen capture', () => {
  it('is available only where the browser can capture a screen', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    expect(canCaptureScreen()).toBe(false);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: vi.fn() } });
    expect(canCaptureScreen()).toBe(true);
    Reflect.deleteProperty(navigator, 'mediaDevices');
    expect(canCaptureScreen()).toBe(false);
  });

  it('lets the browser’s own picker choose, without sound, and offers this tab too', async () => {
    const stream = {} as MediaStream;
    const getDisplayMedia = vi.fn(async () => stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
    expect(await askWhich({ frameRate: { ideal: 15 } })).toBe(stream);
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: { frameRate: { ideal: 15 } },
      audio: false,
      selfBrowserSurface: 'include'
    });
    await askWhich();
    expect(getDisplayMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: true }));
  });

  it('treats closing the picker as an answer, and nothing else as one', () => {
    expect(declined(new DOMException('no', 'NotAllowedError'))).toBe(true);
    expect(declined(new DOMException('no', 'AbortError'))).toBe(true);
    expect(declined(new DOMException('no', 'NotFoundError'))).toBe(false);
    expect(declined(new Error('NotAllowedError'))).toBe(false);
    expect(declined(undefined)).toBe(false);
  });
});
