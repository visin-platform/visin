import { MaskIndex, buildMaskIndex } from './maskIndex';

export interface DecodedImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/**
 * Fetch a PNG (signed file-service URL) and decode it to raw RGBA. Uses fetch +
 * canvas; requires file-service to allow this origin via CORS (label-front's
 * origin must be in file-service CORS_ORIGIN).
 */
export const decodeImage = async (url: string, what: string): Promise<DecodedImage> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${what} (${response.status})`);
  }
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D not available');
  }
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: imageData.width, height: imageData.height, rgba: imageData.data };
};

/** The id map, decoded to a per-pixel maskId lookup. */
export const loadMaskIndex = async (url: string): Promise<MaskIndex> => {
  const { rgba, width, height } = await decodeImage(url, 'id map');
  return buildMaskIndex(rgba, width, height);
};

/**
 * The annotation layer's own pixels.
 *
 * A mask_toggle layer goes through a canvas rather than staying an `<img>`
 * because marking a mask hides it, and erasing part of an image needs its
 * pixels — see `applyMaskCutout`.
 */
export const loadLayerPixels = (url: string): Promise<DecodedImage> =>
  decodeImage(url, 'annotation layer');

/** Warm the browser cache for the next task's images. */
export const preloadImages = (urls: string[]): void => {
  for (const url of urls) {
    const image = new Image();
    image.src = url;
  }
};
