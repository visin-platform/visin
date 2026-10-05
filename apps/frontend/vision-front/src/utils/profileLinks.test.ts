import { beforeEach, describe, expect, it, vi } from 'vitest';

const getGlobalConfig = vi.hoisted(() => vi.fn());
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig }));

import { profileUrl } from './profileLinks';

describe('profileUrl', () => {
  beforeEach(() => {
    getGlobalConfig.mockReset();
    getGlobalConfig.mockReturnValue({});
  });

  it('is the shell’s page for the handle, whatever slashes surround the address', () => {
    getGlobalConfig.mockReturnValue({ SHELL_FRONT_URL: ' https://app.example.test// ' });
    expect(profileUrl('ann-lee')).toBe('https://app.example.test/u/ann-lee');
    expect(profileUrl('a/b')).toBe('https://app.example.test/u/a%2Fb');
  });

  it('is nothing when no address is configured, never a built-in default', () => {
    expect(profileUrl('ann')).toBeUndefined();
    getGlobalConfig.mockReturnValue({ SHELL_FRONT_URL: '  ' });
    expect(profileUrl('ann')).toBeUndefined();
  });

  it('is nothing while the config is not loaded', () => {
    getGlobalConfig.mockImplementation(() => {
      throw new Error('not loaded');
    });
    expect(profileUrl('ann')).toBeUndefined();
  });
});
