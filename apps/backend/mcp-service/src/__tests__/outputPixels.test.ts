import { CLASS_COLOURS, paintConfidence, paintMask, readGrey, trainClasses } from '../outputPixels';
import { greyPng, png, rgbPixels as pixelsOf } from './fixtures/png';

describe('readGrey', () => {
  it('reads one value per pixel from a grey PNG', () => {
    expect(readGrey(greyPng(0, 1, 7))).toEqual({ width: 3, height: 1, values: new Uint8Array([0, 1, 7]) });
  });

  it('leaves a coloured PNG, or anything that is not a PNG, alone', () => {
    expect(readGrey(png({ rows: [[200, 10, 10]], colour: 2 }))).toBeUndefined();
    expect(readGrey(Buffer.from('<html>expired</html>'))).toBeUndefined();
  });
});

describe('paintMask', () => {
  it('paints each class in its colour and names the colours by share of the frame, largest first', () => {
    const { image, legend } = paintMask(readGrey(greyPng(1, 1, 1, 0))!, [
      { index: 0, name: 'road' },
      { index: 1, name: 'car' }
    ]);
    const [road, car] = [[...CLASS_COLOURS[0].rgb], [...CLASS_COLOURS[1].rgb]];
    expect(pixelsOf(image)).toEqual([car, car, car, road]);
    expect(legend).toBe('painted mask, orange = car (75%), blue = road (25%).');
  });

  it('numbers unnamed classes, says how to name them, and warns when colours repeat', () => {
    const { legend } = paintMask(readGrey(greyPng(...Array.from({ length: 300 }, () => 0), 13))!);
    expect(legend).toContain('blue = class 0 (100%)');
    expect(legend).toContain('orange = class 13 (<1%)');
    expect(legend).toContain('Colours repeat after 12 classes');
    expect(legend).toContain('pass the training to name them');
  });
});

describe('paintConfidence', () => {
  it('runs from dark to white across the range a top class can score, and says how sure the model was', () => {
    const { image, legend } = paintConfidence(readGrey(greyPng(0, 255, 255, 255))!, 2);
    const [low, high] = pixelsOf(image);
    expect(low).toEqual([0x0b, 0x0f, 0x19]);
    expect(high).toEqual([255, 255, 255]);
    expect(legend).toBe(
      'painted confidence, dark = unsure (p 0.50) to white = certain (p 1.00); mean p 0.75, 25% of pixels below p 0.5.'
    );
  });

  it('starts the range at zero when the class count is not known', () => {
    expect(paintConfidence(readGrey(greyPng(128))!).legend).toContain('dark = unsure (p 0.00)');
  });
});

describe('trainClasses', () => {
  it('reads the classes the weights name, in index order, skipping malformed entries', () => {
    expect(
      trainClasses({ train_classes: [{ name: 'car', index: 1 }, { name: 'road', index: 0 }, { name: 'x' }, null, { index: 2 }] })
    ).toEqual([
      { index: 0, name: 'road' },
      { index: 1, name: 'car' }
    ]);
    expect(trainClasses(undefined)).toEqual([]);
    expect(trainClasses({ train_classes: 'road' })).toEqual([]);
  });
});
