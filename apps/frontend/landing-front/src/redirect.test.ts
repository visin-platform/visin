import { afterEach, describe, expect, it, vi } from 'vitest';
import { redirectTo } from './redirect';

const original = window.location;

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: original });
});

describe('redirectTo', () => {
  it('leaves for the address without adding to the history', () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { replace } });

    redirectTo('https://app.example.test/');

    expect(replace).toHaveBeenCalledWith('https://app.example.test/');
  });
});
