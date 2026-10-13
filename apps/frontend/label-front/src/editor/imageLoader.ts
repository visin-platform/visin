export interface DecodedImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/**
 * Fetch an image (a signed file-service URL) and decode it to raw RGBA, through
 * fetch and a canvas. Needs file-service to allow this origin via CORS
 * (label-front's origin must be in file-service CORS_ORIGIN).
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

/**
 * A stored mask as one class index per pixel. A mask PNG is 8-bit grayscale, so
 * the red channel of the decoded image is the value.
 */
export const loadMask = async (
  url: string
): Promise<{ width: number; height: number; data: Uint8Array }> => {
  const { rgba, width, height } = await decodeImage(url, 'mask');
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
  return { width, height, data };
};

/** Warm the browser cache for the next frame's images. */
export const preloadImages = (urls: string[]): void => {
  for (const url of urls) {
    const image = new Image();
    image.src = url;
  }
};
