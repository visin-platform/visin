import { afterEach, describe, expect, it, vi } from 'vitest';
import { newBoxId } from './ids';

afterEach(() => vi.unstubAllGlobals());

describe('newBoxId', () => {
  it('uses a UUID where the browser makes them, and makes each different', () => {
    expect(newBoxId()).not.toBe(newBoxId());
    expect(newBoxId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('still gives a unique id where it cannot', () => {
    vi.stubGlobal('crypto', {});

    const first = newBoxId();

    expect(first).toMatch(/^box-/);
    expect(newBoxId()).not.toBe(first);
  });
});
