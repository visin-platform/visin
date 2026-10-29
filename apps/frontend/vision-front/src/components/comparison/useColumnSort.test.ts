import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useColumnSort, useKeyedColumnSort } from './useColumnSort';

describe('useColumnSort', () => {
  it('starts on the given column and direction', () => {
    const { result } = renderHook(() => useColumnSort('training', 'asc'));
    expect(result.current.sortColumn).toBe('training');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('flips the direction when the current column is chosen again', () => {
    const { result } = renderHook(() => useColumnSort('training', 'asc'));
    act(() => result.current.onSort('training'));
    expect(result.current.sortDirection).toBe('desc');
    act(() => result.current.onSort('training'));
    expect(result.current.sortDirection).toBe('asc');
  });

  it('starts another column descending', () => {
    const { result } = renderHook(() => useColumnSort('training', 'asc'));
    act(() => result.current.onSort('meanIoU'));
    expect(result.current.sortColumn).toBe('meanIoU');
    expect(result.current.sortDirection).toBe('desc');
  });
});

describe('useKeyedColumnSort', () => {
  const initial = { column: 'training', direction: 'asc' as const };

  it('gives a table nobody sorted the initial sort', () => {
    const { result } = renderHook(() => useKeyedColumnSort(initial));
    expect(result.current.sortFor('day')).toEqual(initial);
    expect(result.current.sortProps('day')).toMatchObject({ sortColumn: 'training', sortDirection: 'asc' });
  });

  it('sorts each table on its own, flipping a column chosen again and starting another descending', () => {
    const { result } = renderHook(() => useKeyedColumnSort(initial));
    act(() => result.current.sortProps('day').onSort('training'));
    expect(result.current.sortFor('day')).toEqual({ column: 'training', direction: 'desc' });
    act(() => result.current.sortProps('night').onSort('car_iou'));
    expect(result.current.sortFor('night')).toEqual({ column: 'car_iou', direction: 'desc' });
    expect(result.current.sortFor('day')).toEqual({ column: 'training', direction: 'desc' });
  });
});
