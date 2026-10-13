import { toStem } from '../utils/manifest';
import type { RawMask } from '../utils/mask';
import type { IBoxObject } from '../models/LabelAnnotation';

export const baseName = (name: string): string => name.split('/').pop() || name;

/** `a/0001.png`, `0001.ids.png` and `0001_mask.png` all name frame `0001`. */
export const stemOfFile = (name: string): string =>
  toStem(name).replace(/[_-](mask|label|labels|gtFine_labelIds|segmentation)$/i, '');

export const inFolder = (name: string, folder: string): boolean =>
  name.toLowerCase().split('/').slice(0, -1).includes(folder.toLowerCase());

export const hasExtension = (name: string, ...extensions: string[]): boolean =>
  extensions.some((extension) => name.toLowerCase().endsWith(extension));

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** `[x, y, w, h]` with the float noise a unit conversion leaves removed. */
export const tidyBox = (bbox: [number, number, number, number]): [number, number, number, number] =>
  [round(bbox[0]), round(bbox[1]), round(bbox[2]), round(bbox[3])];

export const boundsOf = (points: number[]): [number, number, number, number] | undefined => {
  if (points.length < 4) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return maxX > minX && maxY > minY ? [minX, minY, maxX - minX, maxY - minY] : undefined;
};

/** Even-odd scanline fill of one polygon (`[x0, y0, x1, y1, …]`) into a class-index mask. */
export const fillPolygon = (mask: RawMask, polygon: number[], value: number): void => {
  const { width, height, data } = mask;
  const count = Math.floor(polygon.length / 2);
  if (count < 3) return;
  for (let y = 0; y < height; y++) {
    const crossings: number[] = [];
    const scanY = y + 0.5;
    for (let i = 0; i < count; i++) {
      const x0 = polygon[i * 2];
      const y0 = polygon[i * 2 + 1];
      const x1 = polygon[((i + 1) % count) * 2];
      const y1 = polygon[((i + 1) % count) * 2 + 1];
      if ((y0 <= scanY && y1 > scanY) || (y1 <= scanY && y0 > scanY)) {
        crossings.push(x0 + ((scanY - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.round(crossings[i]));
      const to = Math.min(width, Math.round(crossings[i + 1]));
      if (to > from) data.fill(value, y * width + from, y * width + to);
    }
  }
};

export const rgbOf = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16) || 0, parseInt(value.slice(2, 4), 16) || 0, parseInt(value.slice(4, 6), 16) || 0];
};

export const hexOf = (rgb: [number, number, number]): string =>
  `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

/** Boxes of the frame as the exporters read them: only well-formed ones. */
export const boxesOf = (objects: IBoxObject[]): IBoxObject[] =>
  objects.filter((object) => object.bbox.length === 4 && object.bbox[2] > 0 && object.bbox[3] > 0);

export const parseJson = <T>(buffer: Buffer): T | undefined => {
  try {
    return JSON.parse(buffer.toString('utf8')) as T;
  } catch {
    return undefined;
  }
};
