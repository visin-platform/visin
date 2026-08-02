import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '../../services/passwordService';

describe('hashPassword', () => {
  it('produces a self-describing scrypt record', async () => {
    const hash = await hashPassword('correct horse battery');
    const [scheme, n, r, p, salt, digest] = hash.split('$');

    expect(scheme).toBe('scrypt');
    // Parameters travel with the hash so they can be raised later without
    // invalidating existing passwords.
    expect(Number(n)).toBeGreaterThan(0);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(digest).toMatch(/^[0-9a-f]{128}$/);
  });

  it('salts, so the same password never hashes twice the same', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);

    expect(a).not.toBe(b);
    await expect(verifyPassword('same-password', a)).resolves.toBe(true);
    await expect(verifyPassword('same-password', b)).resolves.toBe(true);
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('literal-secret-value');

    expect(hash).not.toContain('literal-secret-value');
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('a-real-password');

    await expect(verifyPassword('a-real-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('a-real-passwore', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('rejects rather than throws for a missing hash', async () => {
    // A Google-only account has no passwordHash; that must read as "wrong
    // password", not as a 500 that reveals the account is special.
    await expect(verifyPassword('anything', undefined)).resolves.toBe(false);
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    await expect(verifyPassword('anything', '')).resolves.toBe(false);
  });

  it('rejects rather than throws for a malformed record', async () => {
    for (const bad of [
      'not-a-hash',
      'bcrypt$16384$8$1$aa$bb',
      'scrypt$16384$8$1$deadbeef',
      'scrypt$x$8$1$deadbeef$c0ffee',
      'scrypt$16384$8$1$$c0ffee',
      'scrypt$16384$8$1$deadbeef$'
    ]) {
      await expect(verifyPassword('anything', bad)).resolves.toBe(false);
    }
  });

  it('handles a password at the policy minimum', async () => {
    const password = 'x'.repeat(MIN_PASSWORD_LENGTH);
    const hash = await hashPassword(password);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it('is not fooled by a truncated password', async () => {
    const hash = await hashPassword('long-password-value');

    await expect(verifyPassword('long-password-valu', hash)).resolves.toBe(false);
    await expect(verifyPassword('long-password-values', hash)).resolves.toBe(false);
  });
});
