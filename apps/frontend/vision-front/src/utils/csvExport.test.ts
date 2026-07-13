import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportTrainingsToCSV } from './csvExport';
import type { Training } from '../types';

const makeTraining = (overrides: Partial<Training> = {}): Training =>
  ({
    _id: 't1',
    uuid: 'uuid-1',
    name: 'My Training',
    description: 'A description',
    status: 'completed',
    createdAt: '2026-01-15T10:30:00.000Z',
    updatedAt: '2026-01-16T08:00:00.000Z',
    tags: ['a', 'b'],
    metrics: { totalTime: 3661, cpuCost: 1.234, gpuCost: 5.678, totalCost: 6.912, epochCount: 10, maxEpoch: 10 },
    ...overrides,
  } as unknown as Training);

let clickSpy: ReturnType<typeof vi.fn<() => void>>;
let createObjectURLSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clickSpy = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => clickSpy());
  createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportTrainingsToCSV', () => {
  it('builds a CSV with headers and formatted rows, then triggers a download', () => {
    exportTrainingsToCSV([makeTraining()]);

    expect(createObjectURLSpy).toHaveBeenCalled();
    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe('text/csv;charset=utf-8;');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  const captureBlobContent = () => {
    const blobParts: string[] = [];
    class MockBlob {
      type: string;
      constructor(parts: string[], options: { type: string }) {
        blobParts.push(parts[0]);
        this.type = options.type;
      }
    }
    vi.stubGlobal('Blob', MockBlob as unknown as typeof Blob);
    return blobParts;
  };

  it('formats duration with hours, minutes, and seconds', () => {
    const blobParts = captureBlobContent();

    exportTrainingsToCSV([makeTraining({ metrics: { totalTime: 3661, cpuCost: 0, gpuCost: 0, totalCost: 0, epochCount: 1, maxEpoch: 1 } as never })]);

    expect(blobParts[0]).toContain('1h 1m 1s');
  });

  it('formats zero duration as "0s"', () => {
    const blobParts = captureBlobContent();

    exportTrainingsToCSV([makeTraining({ metrics: { totalTime: 0, cpuCost: 0, gpuCost: 0, totalCost: 0, epochCount: 0, maxEpoch: 0 } as never })]);

    expect(blobParts[0]).toContain('"0s"');
  });

  it('handles a training with no metrics, description, or tags', () => {
    const blobParts = captureBlobContent();

    exportTrainingsToCSV([
      makeTraining({ metrics: undefined, description: undefined, tags: undefined } as never),
    ]);

    const csv = blobParts[0];
    expect(csv).toContain('My Training');
    // Empty metrics/description/tags render as empty-quoted fields.
    expect(csv).toMatch(/""/);
  });

  it('handles an empty trainings array', () => {
    exportTrainingsToCSV([]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
