import { describe, it, expect } from 'vitest';
import { isGroupAdmin } from './permissions';

const user = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'u1', email: 'u@x.com', name: 'U', ...overrides }) as never;

describe('isGroupAdmin', () => {
  it('is true for an owner and for an admin', () => {
    expect(isGroupAdmin(user({ groupRoles: ['owner'] }))).toBe(true);
    expect(isGroupAdmin(user({ groupRoles: ['member', 'admin'] }))).toBe(true);
  });

  it('is false for a plain member', () => {
    expect(isGroupAdmin(user({ groupRoles: ['member'] }))).toBe(false);
  });

  it('is false when the roles claim is absent or empty', () => {
    expect(isGroupAdmin(user())).toBe(false);
    expect(isGroupAdmin(user({ groupRoles: [] }))).toBe(false);
    expect(isGroupAdmin(null)).toBe(false);
    expect(isGroupAdmin(undefined)).toBe(false);
  });

  it('reads only the roles claim', () => {
    // The pre-fix checks read a `groups` claim of opaque ids, so they could
    // never match a real token. That claim no longer exists.
    expect(isGroupAdmin(user({ groups: ['owner'] }))).toBe(false);
  });
});
