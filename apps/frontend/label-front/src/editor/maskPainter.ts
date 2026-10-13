import type { DirtyRect } from './EditorDocument';

/** `#rrggbb` → `[r, g, b]`; anything else is mid gray, so a bad stored colour still draws. */
export const parseHex = (hex: string): [number, number, number] => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : [128, 128, 128];
};

/**
 * RGBA for each of the 256 class indices: 0 is transparent, a class gets its own
 * colour, and an index no class owns is gray so stray values show up instead of
 * vanishing.
 */
export const buildPalette = (entries: { maskIndex: number; color: string }[]): Uint8ClampedArray => {
  const palette = new Uint8ClampedArray(256 * 4);
  for (let index = 1; index < 256; index++) {
    palette.set([128, 128, 128, 255], index * 4);
  }
  for (const { maskIndex, color } of entries) {
    if (maskIndex > 0 && maskIndex < 256) {
      palette.set([...parseHex(color), 255], maskIndex * 4);
    }
  }
  return palette;
};

/**
 * Paints a class-index mask onto a canvas context, and repaints only the
 * rectangle that changed — a brush stroke touches a few hundred pixels, and
 * recolouring two megapixels for each pointer move would make painting lag.
 */
export class MaskPainter {
  private readonly image: ImageData;
  private readonly context: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;
  private palette: Uint8ClampedArray;

  constructor(context: CanvasRenderingContext2D, width: number, height: number, palette: Uint8ClampedArray) {
    this.context = context;
    this.width = width;
    this.height = height;
    this.palette = palette;
    this.image = context.createImageData(width, height);
  }

  setPalette(palette: Uint8ClampedArray): void {
    this.palette = palette;
  }

  /** Paint `rect` of `data` (everything when null) and push it to the canvas. */
  paint(data: Uint8Array, rect: DirtyRect | null = null): void {
    const x0 = Math.max(0, rect?.x0 ?? 0);
    const y0 = Math.max(0, rect?.y0 ?? 0);
    const x1 = Math.min(this.width, rect?.x1 ?? this.width);
    const y1 = Math.min(this.height, rect?.y1 ?? this.height);
    if (x1 <= x0 || y1 <= y0) return;
    const pixels = this.image.data;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const source = (y * this.width + x);
        pixels.set(this.palette.subarray(data[source] * 4, data[source] * 4 + 4), source * 4);
      }
    }
    this.context.putImageData(this.image, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
}
