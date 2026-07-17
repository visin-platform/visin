import { MaskIndex, buildMaskIndex } from './maskIndex';

/**
 * Fetch the id-map PNG (signed file-service URL) and decode it to a per-pixel
 * maskId lookup. Uses fetch + canvas; requires file-service to allow this
 * origin via CORS (label-front's origin must be in file-service CORS_ORIGIN).
 */
export const loadMaskIndex = async (url: string): Promise<MaskIndex> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load id map (${response.status})`);
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
  return buildMaskIndex(imageData.data, imageData.width, imageData.height);
};

/** Warm the browser cache for the next task's images. */
export const preloadImages = (urls: string[]): void => {
  for (const url of urls) {
    const image = new Image();
    image.src = url;
  }
};
