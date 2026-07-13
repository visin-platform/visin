import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMobileChartTooltip } from './useMobileChartTooltip';

describe('useMobileChartTooltip', () => {
  it('returns isMobile as a boolean derived from the current breakpoint', () => {
    const { result } = renderHook(() => useMobileChartTooltip());
    expect(typeof result.current.isMobile).toBe('boolean');
  });
});
