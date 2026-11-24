import { describe, expect, it } from 'vitest';
import { drainMs } from '../../services/drain';

describe('drainMs', () => {
  it('lets every turn end in production (a turn stops itself at 260s) and is short in development', () => {
    expect(drainMs({ NODE_ENV: 'production' })).toBe(265_000);
    expect(drainMs({ NODE_ENV: 'development' })).toBe(5_000);
    expect(drainMs({})).toBe(5_000);
  });

  it('takes WORKER_DRAIN_MS when it is a number, including 0', () => {
    expect(drainMs({ NODE_ENV: 'production', WORKER_DRAIN_MS: '30000' })).toBe(30_000);
    expect(drainMs({ NODE_ENV: 'production', WORKER_DRAIN_MS: '0' })).toBe(0);
  });

  it('ignores a value that is not a number or is empty', () => {
    expect(drainMs({ NODE_ENV: 'production', WORKER_DRAIN_MS: 'soon' })).toBe(265_000);
    expect(drainMs({ NODE_ENV: 'production', WORKER_DRAIN_MS: '' })).toBe(265_000);
    expect(drainMs({ NODE_ENV: 'production', WORKER_DRAIN_MS: '-1' })).toBe(265_000);
  });
});
