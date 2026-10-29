/**
 * Zoom/pan math for the full-frame viewer, pure so it is unit-testable.
 * A viewport transform maps image space → screen space:
 * screen = image * scale + offset.
 */

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 40;

const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Fit the whole image inside the container, centered. */
export const fitViewport = (
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number
): Viewport => {
  const scale = clampScale(Math.min(containerWidth / imageWidth, containerHeight / imageHeight) || 1);
  return {
    scale,
    offsetX: (containerWidth - imageWidth * scale) / 2,
    offsetY: (containerHeight - imageHeight * scale) / 2
  };
};

/** Zoom by a factor, keeping the screen point (px, py) fixed. */
export const zoomAt = (viewport: Viewport, factor: number, px: number, py: number): Viewport => {
  const scale = clampScale(viewport.scale * factor);
  const ratio = scale / viewport.scale;
  return {
    scale,
    offsetX: px - (px - viewport.offsetX) * ratio,
    offsetY: py - (py - viewport.offsetY) * ratio
  };
};

export const panBy = (viewport: Viewport, dx: number, dy: number): Viewport => ({
  ...viewport,
  offsetX: viewport.offsetX + dx,
  offsetY: viewport.offsetY + dy
});

/** Screen coordinate → image coordinate. */
export const toImagePoint = (viewport: Viewport, px: number, py: number): { x: number; y: number } => ({
  x: (px - viewport.offsetX) / viewport.scale,
  y: (py - viewport.offsetY) / viewport.scale
});
