import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_STOPS,
  confidenceOf,
  describePixel,
  frameOf,
  greyValues,
  hexRgb,
  isDecodedKind,
  isOutputKind,
  paintConfidence,
  paintMask,
  presentClasses,
  rampLut
} from './outputPixels';

/** Pixels as a canvas reads them: one grey value per pixel, repeated across r, g and b. */
const grey = (...values: number[]) => new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));

describe('output pixels', () => {
  it('knows which visualization types are a model’s outputs, and which hold values', () => {
    expect(['segment', 'mask', 'confidence', 'overlay'].map(isOutputKind)).toEqual([true, true, true, false]);
    expect(['segment', 'mask', 'confidence'].map(isDecodedKind)).toEqual([false, true, true]);
  });

  it('reads hex colours, short and long, and nothing else', () => {
    expect(hexRgb('#2a78d6')).toEqual([42, 120, 214]);
    expect(hexRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexRgb('teal')).toBeUndefined();
  });

  it('builds a ramp that runs from its first stop to its last, growing lighter', () => {
    const lut = rampLut();
    expect(lut).toHaveLength(256);
    expect(lut[0]).toEqual(hexRgb(CONFIDENCE_STOPS[0]));
    expect(lut[255]).toEqual(hexRgb(CONFIDENCE_STOPS[CONFIDENCE_STOPS.length - 1]));
    const light = ([r, g, b]: readonly number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (let step = 16; step < 256; step += 16) expect(light(lut[step])).toBeGreaterThan(light(lut[step - 16]));
    expect(rampLut(['#000000', '#ffffff'])[128]).toEqual([128, 128, 128]);
  });

  it('takes one value per grey pixel, and leaves a mask with its own colours alone', () => {
    expect([...greyValues(grey(0, 2, 7))!]).toEqual([0, 2, 7]);
    expect(greyValues(new Uint8ClampedArray([1, 1, 1, 255, 200, 10, 10, 255]))).toBeUndefined();
  });

  it('lists the classes a mask uses', () => {
    expect(presentClasses(new Uint8Array([3, 0, 3, 1]))).toEqual([0, 1, 3]);
  });

  it('paints each class in its colour', () => {
    const colours = [[10, 20, 30], [40, 50, 60]] as const;
    expect([...paintMask(new Uint8Array([1, 0]), (index) => colours[index] ?? [0, 0, 0])]).toEqual([
      40, 50, 60, 255, 10, 20, 30, 255
    ]);
  });

  it('stretches confidence from the least a top class can score to certainty', () => {
    const lut = rampLut(['#000000', '#ffffff']);
    const floor = 1 / 3;
    const painted = paintConfidence(new Uint8Array([0, 85, 170, 255]), lut, floor);
    // Below the floor is clamped to the start; 170/255 is half way from 1/3 to 1.
    expect([painted[0], painted[4], painted[12]]).toEqual([0, 0, 255]);
    expect(Math.abs(painted[8] - 128)).toBeLessThanOrEqual(1);
    expect(paintConfidence(new Uint8Array([128]), lut)[0]).toBe(128);
    expect(confidenceOf(255)).toBe(1);
  });

  it('names a frame by what the upload said, or by its file name', () => {
    expect(frameOf({ filename: 'frames/sq11_000301.png' })).toBe('sq11_000301');
    expect(frameOf({ filename: 'x.png', metadata: { prediction: { frame: 'sq14_000061' } } })).toBe('sq14_000061');
    expect(frameOf({ filename: 'x.png', metadata: { prediction: { frame: '' } } })).toBe('x');
  });

  it('says what a pixel holds', () => {
    expect(describePixel('mask', 1, [{ index: 1, name: 'car' }])).toBe('car (class 1)');
    expect(describePixel('mask', 4)).toBe('Class 4');
    expect(describePixel('confidence', 230)).toBe('p ≈ 0.90');
  });
});
