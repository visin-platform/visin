import { beforeEach, describe, expect, it, vi } from 'vitest';

const getGlobalConfig = vi.hoisted(() => vi.fn());
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig }));

import { docsUrl, ELIGIBILITY_GUIDE } from './docsLinks';

describe('docsUrl', () => {
  beforeEach(() => {
    getGlobalConfig.mockReset();
    getGlobalConfig.mockReturnValue({});
  });

  it('is the configured docs site and the path, whatever slashes surround them', () => {
    getGlobalConfig.mockReturnValue({ LANDING_FRONT_URL: ' https://docs.example.test// ' });
    expect(docsUrl(ELIGIBILITY_GUIDE)).toBe('https://docs.example.test/docs/eligibility');
    expect(docsUrl('docs/suites#fields')).toBe('https://docs.example.test/docs/suites#fields');
  });

  it('is nothing when no address is configured, never a built-in default', () => {
    expect(docsUrl(ELIGIBILITY_GUIDE)).toBeUndefined();
    getGlobalConfig.mockReturnValue({ LANDING_FRONT_URL: '   ' });
    expect(docsUrl(ELIGIBILITY_GUIDE)).toBeUndefined();
  });

  it('is nothing while the config is not loaded', () => {
    getGlobalConfig.mockImplementation(() => {
      throw new Error('not loaded');
    });
    expect(docsUrl(ELIGIBILITY_GUIDE)).toBeUndefined();
  });
});
