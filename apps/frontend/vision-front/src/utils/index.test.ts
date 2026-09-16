import { describe, it, expect } from 'vitest';
import { exportTrainingsToCSV, formatDate, formatDateTime, formatDuration } from './index';

describe('utils/index re-exports', () => {
  it('re-exports exportTrainingsToCSV, formatDate, formatDateTime, and formatDuration', () => {
    expect(exportTrainingsToCSV).toBeInstanceOf(Function);
    expect(formatDate).toBeInstanceOf(Function);
    expect(formatDateTime).toBeInstanceOf(Function);
    expect(formatDuration).toBeInstanceOf(Function);
  });
});
