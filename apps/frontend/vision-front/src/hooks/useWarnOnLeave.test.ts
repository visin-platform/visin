import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWarnOnLeave } from './useWarnOnLeave';

const leave = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('useWarnOnLeave', () => {
  it('asks before leaving only while active', () => {
    const { rerender, unmount } = renderHook(({ active }) => useWarnOnLeave(active), { initialProps: { active: false } });
    expect(leave()).toBe(false);
    rerender({ active: true });
    expect(leave()).toBe(true);
    rerender({ active: false });
    expect(leave()).toBe(false);
    rerender({ active: true });
    unmount();
    expect(leave()).toBe(false);
  });
});
