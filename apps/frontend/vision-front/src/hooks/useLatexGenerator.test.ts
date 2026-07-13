import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../utils/latexGenerator', () => ({
  generateAggregatedLatexCode: vi.fn(() => '\\begin{table}mock\\end{table}')
}));

import { generateAggregatedLatexCode } from '../utils/latexGenerator';
import { useLatexGenerator } from './useLatexGenerator';

const mockedGenerate = vi.mocked(generateAggregatedLatexCode);

describe('useLatexGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty strings for all generators when comparisonData is empty', () => {
    const { result } = renderHook(() => useLatexGenerator([]));

    expect(result.current.generateLatexTable()).toBe('');
    expect(result.current.generatePerformanceLatexTable()).toBe('');
    expect(result.current.generatePerClassLatexTable()).toBe('');
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('generates latex from the first comparison entry using its aggregated results', () => {
    const comparisonData = [
      {
        aggregatedResults: { day_fair: { vehicle: { iou: { mean: 0.8 } } } },
        training: { _id: 't1', name: 'Training 1' },
        testResultsCount: 3
      }
    ];

    const { result } = renderHook(() => useLatexGenerator(comparisonData));
    const output = result.current.generateLatexTable();

    expect(output).toBe('\\begin{table}mock\\end{table}');
    expect(mockedGenerate).toHaveBeenCalledWith(comparisonData[0].aggregatedResults, false, 3);
  });

  it('detects cyclist + pedestrian data across conditions', () => {
    const comparisonData = [
      {
        aggregatedResults: { day_fair: { 'cyclist + pedestrian': { iou: { mean: 0.5 } } } },
        training: { _id: 't1', name: 'Training 1' },
        testResultsCount: 1
      }
    ];

    const { result } = renderHook(() => useLatexGenerator(comparisonData));
    result.current.generatePerformanceLatexTable();

    expect(mockedGenerate).toHaveBeenCalledWith(comparisonData[0].aggregatedResults, true, 1);
  });

  it('defaults testResultsCount to 0 when missing', () => {
    const comparisonData = [
      { aggregatedResults: {}, training: { _id: 't1', name: 'Training 1' }, testResultsCount: undefined as unknown as number }
    ];

    const { result } = renderHook(() => useLatexGenerator(comparisonData));
    result.current.generatePerClassLatexTable();

    expect(mockedGenerate).toHaveBeenCalledWith({}, false, 0);
  });
});
