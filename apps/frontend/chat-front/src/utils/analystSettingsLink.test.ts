import { afterEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ ADMIN_FRONT_URL: undefined as string | undefined, ACCOUNT_FRONT_URL: undefined as string | undefined }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

import { analystSettingsHref } from './analystSettingsLink';

afterEach(() => {
  config.ADMIN_FRONT_URL = undefined;
  config.ACCOUNT_FRONT_URL = undefined;
  document.getElementById('shell-root')?.remove();
});

describe('analystSettingsHref', () => {
  it("goes to Administration's Vivi setup where Admin is configured, in or out of the shell", () => {
    config.ADMIN_FRONT_URL = 'https://admin.example.test/';
    expect(analystSettingsHref()).toBe('https://admin.example.test/vivi');
    const shell = document.createElement('div');
    shell.id = 'shell-root';
    document.body.appendChild(shell);
    expect(analystSettingsHref()).toBe('https://admin.example.test/vivi');
  });

  it("falls back to Account's Analyst section without Admin: a path inside the shell, the account app outside it", () => {
    config.ACCOUNT_FRONT_URL = 'https://account.example.test/';
    expect(analystSettingsHref()).toBe('https://account.example.test/account/analyst');
    const shell = document.createElement('div');
    shell.id = 'shell-root';
    document.body.appendChild(shell);
    expect(analystSettingsHref()).toBe('/account/analyst');
  });

  it('is still a usable path with nothing configured', () => {
    expect(analystSettingsHref()).toBe('/account/analyst');
  });
});
