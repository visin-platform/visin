import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeImage, loadMask, preloadImages } from './imageLoader';

const stubImageDecoding = (rgba: number[], width: number, height: number, ok = true) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 404, blob: async () => new Blob(['x']) }))
  );
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height })));
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ width, height, data: Uint8ClampedArray.from(rgba) }))
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return context;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('decodeImage', () => {
  it('fetches, decodes through a canvas, and returns the pixels', async () => {
    const context = stubImageDecoding([1, 2, 3, 255], 1, 1);

    const decoded = await decodeImage('https://files.example.test/a.png', 'frame');

    expect(decoded).toMatchObject({ width: 1, height: 1 });
    expect(Array.from(decoded.rgba)).toEqual([1, 2, 3, 255]);
    expect(context.drawImage).toHaveBeenCalled();
  });

  it('names what failed to load', async () => {
    stubImageDecoding([], 1, 1, false);
    await expect(decodeImage('https://files.example.test/a.png', 'mask')).rejects.toThrow('Failed to load mask (404)');
  });

  it('fails when there is no 2D canvas', async () => {
    stubImageDecoding([0, 0, 0, 0], 1, 1);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(decodeImage('https://files.example.test/a.png', 'mask')).rejects.toThrow('Canvas 2D not available');
  });
});

describe('loadMask', () => {
  it('reads the class index from the red channel', async () => {
    stubImageDecoding([0, 0, 0, 255, 1, 1, 1, 255, 7, 7, 7, 255], 3, 1);

    const mask = await loadMask('https://files.example.test/m.png');

    expect(mask.width).toBe(3);
    expect(Array.from(mask.data)).toEqual([0, 1, 7]);
  });
});

describe('preloadImages', () => {
  it('asks the browser for each image', () => {
    const created: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(value: string) {
          created.push(value);
        }
      }
    );

    preloadImages(['a', 'b']);

    expect(created).toEqual(['a', 'b']);
  });
});
