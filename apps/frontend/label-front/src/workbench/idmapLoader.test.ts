import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadLayerPixels, loadMaskIndex, preloadImages } from './idmapLoader';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadMaskIndex', () => {
  it('fetches, rasterizes, and indexes the id map', async () => {
    const blob = new Blob(['png']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 1 }));
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([0, 0, 0, 255, 3, 3, 3, 255]),
        width: 2,
        height: 1,
      })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);

    const index = await loadMaskIndex('http://signed/idmap.png');

    expect([...index.maskIdAt]).toEqual([-1, 2]);
    expect(context.drawImage).toHaveBeenCalled();
  });

  it('throws on a failed fetch and on a missing canvas context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(loadMaskIndex('u')).rejects.toThrow('Failed to load id map (403)');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1 }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(loadMaskIndex('u')).rejects.toThrow('Canvas 2D not available');
  });
});

describe('loadLayerPixels', () => {
  it('returns the layer as raw RGBA, for cutting marked masks out of', async () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 1 }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: rgba, width: 2, height: 1 })),
    } as unknown as CanvasRenderingContext2D);

    await expect(loadLayerPixels('http://signed/layer.png')).resolves.toEqual({
      width: 2,
      height: 1,
      rgba,
    });
  });

  it('names the layer in its error, so a failure is not mistaken for the id map', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(loadLayerPixels('u')).rejects.toThrow('Failed to load annotation layer (404)');
  });
});

describe('preloadImages', () => {
  it('creates an Image per url', () => {
    const sources: string[] = [];
    class FakeImage {
      set src(value: string) {
        sources.push(value);
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image);

    preloadImages(['a', 'b']);

    expect(sources).toEqual(['a', 'b']);
  });
});
