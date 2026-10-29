import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// The workbench tests render a whole editor page; on a loaded machine (CI, or a coverage run) the default 1 s
// for a `waitFor` or `findBy` is not always enough for the first render to settle.
configure({ asyncUtilTimeout: 4000 });

// jsdom lacks these browser APIs the workbench uses.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataStub {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = ImageDataStub as unknown as typeof ImageData;
}
