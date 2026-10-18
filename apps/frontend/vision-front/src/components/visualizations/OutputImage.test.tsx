import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { chartSeries } from '@visin/frontend-core';
import { renderWithClient } from '../../test/renderWithClient';
import { hexRgb, rampLut } from '../../utils/outputPixels';
import OutputImage from './OutputImage';
import { visualizationService } from '../../services/visualizationService';

vi.mock('../../services/visualizationService', () => ({
  visualizationService: { getVisualizationByUuid: vi.fn() }
}));
const refresh = vi.mocked(visualizationService.getVisualizationByUuid);

/** Pixels as a canvas reads them: one grey value per pixel. */
const grey = (...values: number[]) => new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));

const image = (type: string) => ({
  visualization_uuid: `${type}-1`,
  type,
  filename: `${type}.png`,
  signedUrl: `https://files.example.test/${type}.png`
});

let pixels = grey(0, 1);
const putImageData = vi.fn();

beforeEach(() => {
  pixels = grey(0, 1);
  putImageData.mockClear();
  refresh.mockReset();
  refresh.mockResolvedValue({ success: true, data: { signedUrl: 'https://files.example.test/fresh.png' } } as never);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob() })));
  vi.stubGlobal('createImageBitmap', vi.fn(async (source: { width?: number }, options?: { resizeWidth?: number }) =>
    options?.resizeWidth ? { width: options.resizeWidth, height: 1 } : { width: source.width ?? 2, height: 1 }
  ));
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: pixels }),
        putImageData,
        fillStyle: ''
      }) as unknown as CanvasRenderingContext2D
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const painted = () => [...(putImageData.mock.calls.at(-1)![0] as { data: Uint8ClampedArray }).data];

describe('OutputImage', () => {
  it('shows a picture as the image it is, with no query to make', () => {
    render(<OutputImage visualization={image('segment')} />);
    expect(screen.getByRole('img', { name: 'segment.png' })).toHaveAttribute('src', 'https://files.example.test/segment.png');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('paints a mask in its classes’ colours, says which it uses, and reads the pixel under the pointer', async () => {
    const onDecoded = vi.fn();
    const onPixel = vi.fn();
    renderWithClient(
      <OutputImage
        visualization={image('mask')}
        classes={[{ index: 0, name: 'road' }, { index: 1, name: 'car' }]}
        onDecoded={onDecoded}
        onPixel={onPixel}
      />
    );
    const canvas = screen.getByRole('img', { name: 'mask.png' });
    expect(canvas.tagName).toBe('CANVAS');
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    expect(painted()).toEqual([...hexRgb(chartSeries.light[0])!, 255, ...hexRgb(chartSeries.light[1])!, 255]);
    expect(onDecoded).toHaveBeenCalledWith([0, 1]);
    expect(canvas).toHaveAttribute('aria-busy', 'false');

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 2, height: 1 } as DOMRect);
    fireEvent.mouseMove(canvas, { clientX: 1.5, clientY: 0.5 });
    expect(onPixel).toHaveBeenLastCalledWith('car (class 1)');
    fireEvent.mouseMove(canvas, { clientX: 5, clientY: 0.5 });
    expect(onPixel).toHaveBeenLastCalledWith(null);
    fireEvent.mouseLeave(canvas);
    expect(onPixel).toHaveBeenLastCalledWith(null);
  });

  it('paints confidence on the ramp, stretched from one over the class count', async () => {
    pixels = grey(127, 255);
    renderWithClient(<OutputImage visualization={image('confidence')} classes={[{ index: 0, name: 'a' }, { index: 1, name: 'b' }]} />);
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    const lut = rampLut();
    expect(painted()).toEqual([...lut[0], 255, ...lut[255], 255]);
  });

  it('shows a mask saved with its own palette as it is', async () => {
    pixels = new Uint8ClampedArray([200, 10, 10, 255, 1, 1, 1, 255]);
    renderWithClient(<OutputImage visualization={image('mask')} />);
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    expect(painted()).toEqual([...pixels]);
  });

  it('decodes a thumbnail no wider than it needs', async () => {
    renderWithClient(<OutputImage visualization={image('mask')} maxWidth={1} />);
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    expect(createImageBitmap).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ resizeWidth: 1, resizeQuality: 'pixelated' }));
  });

  it('asks for a new link when the one it has is about to expire', async () => {
    renderWithClient(<OutputImage visualization={{ ...image('mask'), urlExpiresAt: new Date(Date.now() + 1000).toISOString() }} />);
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalledWith('mask-1');
    expect(fetch).toHaveBeenCalledWith('https://files.example.test/fresh.png');
  });

  it('asks for a new link once when the file refuses the old one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('fresh.png') ? { ok: true, blob: async () => new Blob() } : { ok: false, status: 403 }))
    );
    renderWithClient(<OutputImage visualization={{ ...image('mask'), urlExpiresAt: new Date(Date.now() + 60_000).toISOString() }} />);
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to the plain image when the pixels cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
    renderWithClient(<OutputImage visualization={image('mask')} alt="Mask of frame 1" />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Mask of frame 1' }).tagName).toBe('IMG'));
  });

  it('replaces a picture’s expired link once, and gives up after that', async () => {
    render(<OutputImage visualization={image('segment')} />);
    const picture = screen.getByRole('img', { name: 'segment.png' });
    fireEvent.error(picture);
    await waitFor(() => expect(picture).toHaveAttribute('src', 'https://files.example.test/fresh.png'));
    fireEvent.error(picture);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('decodes a frame only once it comes near the screen', async () => {
    let reveal: (entries: Array<{ isIntersecting: boolean }>) => void = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof reveal) {
          reveal = callback;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    renderWithClient(<OutputImage visualization={image('mask')} />);
    expect(fetch).not.toHaveBeenCalled();
    reveal([{ isIntersecting: false }]);
    expect(fetch).not.toHaveBeenCalled();
    reveal([{ isIntersecting: true }]);
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    expect(disconnect).toHaveBeenCalled();
  });
});
