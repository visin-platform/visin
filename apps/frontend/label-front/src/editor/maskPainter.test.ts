import { describe, expect, it, vi } from 'vitest';
import { MaskPainter, buildPalette, parseHex } from './maskPainter';

const fakeContext = () => {
  const image = { data: new Uint8ClampedArray(4 * 4 * 2), width: 4, height: 2 };
  const context = {
    createImageData: vi.fn(() => image),
    putImageData: vi.fn()
  };
  return { context: context as unknown as CanvasRenderingContext2D, image, spy: context };
};

describe('parseHex', () => {
  it('reads #rrggbb, and falls back to gray for anything else', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('#FF8000')).toEqual([255, 128, 0]);
    expect(parseHex('red')).toEqual([128, 128, 128]);
    expect(parseHex('#fff')).toEqual([128, 128, 128]);
  });
});

describe('buildPalette', () => {
  it('leaves 0 transparent, colours the classes, and makes a stray index gray', () => {
    const palette = buildPalette([{ maskIndex: 2, color: '#ff0000' }]);

    expect(Array.from(palette.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(palette.subarray(8, 12))).toEqual([255, 0, 0, 255]);
    expect(Array.from(palette.subarray(12, 16))).toEqual([128, 128, 128, 255]);
  });

  it('ignores a class whose index cannot be a mask value', () => {
    const palette = buildPalette([
      { maskIndex: 0, color: '#ff0000' },
      { maskIndex: 300, color: '#ff0000' }
    ]);
    expect(Array.from(palette.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });
});

describe('MaskPainter', () => {
  const palette = buildPalette([{ maskIndex: 1, color: '#00ff00' }]);

  it('paints every pixel and pushes the whole image', () => {
    const { context, image, spy } = fakeContext();
    const painter = new MaskPainter(context, 4, 2, palette);

    painter.paint(Uint8Array.from([0, 1, 1, 0, 0, 0, 0, 1]));

    expect(Array.from(image.data.subarray(4, 8))).toEqual([0, 255, 0, 255]);
    expect(Array.from(image.data.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(spy.putImageData).toHaveBeenCalledWith(image, 0, 0, 0, 0, 4, 2);
  });

  it('repaints only the rectangle it is given, clipped to the image', () => {
    const { context, image, spy } = fakeContext();
    const painter = new MaskPainter(context, 4, 2, palette);

    painter.paint(new Uint8Array(8).fill(1), { x0: 1, y0: 0, x1: 3, y1: 1 });

    expect(Array.from(image.data.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(image.data.subarray(4, 8))).toEqual([0, 255, 0, 255]);
    expect(spy.putImageData).toHaveBeenCalledWith(image, 0, 0, 1, 0, 2, 1);

    spy.putImageData.mockClear();
    painter.paint(new Uint8Array(8), { x0: -5, y0: -5, x1: 100, y1: 100 });
    expect(spy.putImageData).toHaveBeenCalledWith(image, 0, 0, 0, 0, 4, 2);
  });

  it('does nothing for an empty rectangle, and takes a new palette', () => {
    const { context, image, spy } = fakeContext();
    const painter = new MaskPainter(context, 4, 2, palette);

    painter.paint(new Uint8Array(8), { x0: 2, y0: 0, x1: 2, y1: 2 });
    expect(spy.putImageData).not.toHaveBeenCalled();

    painter.setPalette(buildPalette([{ maskIndex: 1, color: '#0000ff' }]));
    painter.paint(new Uint8Array(8).fill(1));
    expect(Array.from(image.data.subarray(0, 4))).toEqual([0, 0, 255, 255]);
  });
});
