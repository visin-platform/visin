import { describe, it, expect } from 'vitest';
import { exportTrainingsToCSV, formatDateTime, formatDuration } from './index';

describe('utils/index re-exports', () => {
  it('re-exports exportTrainingsToCSV, formatDateTime, and formatDuration', () => {
    expect(exportTrainingsToCSV).toBeInstanceOf(Function);
    expect(formatDateTime).toBeInstanceOf(Function);
    expect(formatDuration).toBeInstanceOf(Function);
  });
});
