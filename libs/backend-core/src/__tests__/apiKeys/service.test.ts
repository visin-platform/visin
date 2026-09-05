jest.mock('../../apiKeys/ApiKey', () => ({
  ApiKey: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn()
  }
}));

import { ApiKey } from '../../apiKeys/ApiKey';
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  revealApiKey,
  revokeApiKey,
  verifyApiKey
} from '../../apiKeys/service';
import { encryptSecret, generateKey, resetEncryptionKeyCache, sha256 } from '../../apiKeys/crypto';

const create = ApiKey.create as unknown as jest.Mock;
const find = ApiKey.find as unknown as jest.Mock;
const findOne = ApiKey.findOne as unknown as jest.Mock;
const updateOne = ApiKey.updateOne as unknown as jest.Mock;
const deleteOne = ApiKey.deleteOne as unknown as jest.Mock;

const CREATED_AT = new Date('2026-09-01T00:00:00.000Z');

/** A stored key document, with the `save()` the service mutates and calls. */
function storedKey(over: Record<string, unknown> = {}) {
  return {
    _id: 'doc-1',
    userId: 'u1',
    userEmail: 'u1@example.com',
    userName: 'Tester',
    name: 'Claude Code',
    keyId: '0123456789ab',
    hash: sha256('a-secret-value-long-enough'),
    sealedCiphertext: 'ct',
    sealedIv: 'iv',
    sealedTag: 'tag',
    scopes: ['vision:read'],
    revealCount: 0,
    lastRevealedAt: undefined as Date | undefined,
    lastUsedAt: undefined as Date | undefined,
    expiresAt: undefined as Date | undefined,
    revokedAt: undefined as Date | undefined,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    save: jest.fn().mockResolvedValue(undefined),
    ...over
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.API_KEY_ENCRYPTION_SECRET = 'a-test-encryption-secret';
  resetEncryptionKeyCache();
  updateOne.mockReturnValue(Promise.resolve(undefined));
});

afterAll(() => {
  delete process.env.API_KEY_ENCRYPTION_SECRET;
  resetEncryptionKeyCache();
});

describe('createApiKey', () => {
  it('returns the token once and stores only a digest and a sealed copy of it', () => {
    create.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve(storedKey(doc))
    );

    return createApiKey({
      userId: 'u1',
      userEmail: 'u1@example.com',
      userName: 'Tester',
      name: 'Claude Code',
      scopes: ['vision:read', 'dataset:read']
    }).then(({ token, summary }) => {
      const stored = create.mock.calls[0][0];

      expect(token).toMatch(/^vsn_live_[0-9a-f]{12}_.+$/);
      // The plaintext must never reach a column of its own.
      expect(Object.values(stored)).not.toContain(token);
      expect(stored.hash).toBe(sha256(token.split('_').slice(3).join('_')));
      expect(summary.prefix).toBe(`vsn_live_${stored.keyId}`);
      expect(summary.scopes).toEqual(['vision:read', 'dataset:read']);
    });
  });

  it('renders an unexpiring, never-used key as nulls rather than undefined', async () => {
    // The summary crosses an HTTP boundary, where an absent field and an
    // explicit null read very differently to a client.
    create.mockResolvedValue(storedKey());

    const { summary } = await createApiKey({
      userId: 'u1',
      userEmail: 'u1@example.com',
      userName: 'Tester',
      name: 'Claude Code',
      scopes: []
    });

    expect(summary).toMatchObject({
      id: 'doc-1',
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: CREATED_AT.toISOString()
    });
  });

  it('passes an expiry through when one was chosen', async () => {
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    create.mockResolvedValue(storedKey({ expiresAt }));

    const { summary } = await createApiKey({
      userId: 'u1',
      userEmail: 'u1@example.com',
      userName: 'Tester',
      name: 'Claude Code',
      scopes: ['vision:read'],
      expiresAt
    });

    expect(create.mock.calls[0][0].expiresAt).toEqual(expiresAt);
    expect(summary.expiresAt).toBe(expiresAt.toISOString());
  });

  it('treats an explicit null expiry as no expiry', async () => {
    create.mockResolvedValue(storedKey());

    await createApiKey({
      userId: 'u1',
      userEmail: 'u1@example.com',
      userName: 'Tester',
      name: 'Claude Code',
      scopes: [],
      expiresAt: null
    });

    expect(create.mock.calls[0][0].expiresAt).toBeUndefined();
  });
});

describe('listApiKeys', () => {
  it("returns the owner's keys newest first, with no secret material", async () => {
    const sort = jest.fn().mockResolvedValue([storedKey(), storedKey({ _id: 'doc-2' })]);
    find.mockReturnValue({ sort });

    const keys = await listApiKeys('u1');

    expect(find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(keys.map((k) => k.id)).toEqual(['doc-1', 'doc-2']);
    expect(JSON.stringify(keys)).not.toContain('sealedCiphertext');
    expect(JSON.stringify(keys)).not.toContain('hash');
  });
});

describe('revealApiKey', () => {
  it('decrypts the stored copy and records that it was read', async () => {
    const { token } = generateKey();
    const sealed = encryptSecret(token);
    const key = storedKey({
      sealedCiphertext: sealed.ciphertext,
      sealedIv: sealed.iv,
      sealedTag: sealed.tag
    });
    findOne.mockResolvedValue(key);

    await expect(revealApiKey('u1', 'doc-1')).resolves.toBe(token);
    expect(key.revealCount).toBe(1);
    expect(key.lastRevealedAt).toBeInstanceOf(Date);
    expect(key.save).toHaveBeenCalled();
  });

  it('scopes the lookup to the owner, so a mismatch never reaches the decrypt', async () => {
    findOne.mockResolvedValue(null);

    await expect(revealApiKey('u2', 'doc-1')).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({ _id: 'doc-1', userId: 'u2' });
  });

  it('still reveals a revoked key — the owner may need to see which one they turned off', async () => {
    const { token } = generateKey();
    const sealed = encryptSecret(token);
    findOne.mockResolvedValue(
      storedKey({
        revokedAt: new Date(),
        sealedCiphertext: sealed.ciphertext,
        sealedIv: sealed.iv,
        sealedTag: sealed.tag
      })
    );

    await expect(revealApiKey('u1', 'doc-1')).resolves.toBe(token);
  });
});

describe('revokeApiKey', () => {
  it('tombstones the key rather than deleting it', async () => {
    const key = storedKey();
    findOne.mockResolvedValue(key);

    const summary = await revokeApiKey('u1', 'doc-1');

    expect(key.revokedAt).toBeInstanceOf(Date);
    expect(key.save).toHaveBeenCalled();
    expect(summary?.revokedAt).toBe(key.revokedAt?.toISOString());
  });

  it('leaves an already-revoked key at its original timestamp', async () => {
    const revokedAt = new Date('2026-08-01T00:00:00.000Z');
    const key = storedKey({ revokedAt });
    findOne.mockResolvedValue(key);

    const summary = await revokeApiKey('u1', 'doc-1');

    expect(key.save).not.toHaveBeenCalled();
    expect(summary?.revokedAt).toBe(revokedAt.toISOString());
  });

  it("returns null for a key that is not the caller's", async () => {
    findOne.mockResolvedValue(null);
    await expect(revokeApiKey('u2', 'doc-1')).resolves.toBeNull();
  });
});

describe('deleteApiKey', () => {
  it('reports whether anything was removed', async () => {
    deleteOne.mockResolvedValue({ deletedCount: 1 });
    await expect(deleteApiKey('u1', 'doc-1')).resolves.toBe(true);
    expect(deleteOne).toHaveBeenCalledWith({ _id: 'doc-1', userId: 'u1' });

    deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(deleteApiKey('u2', 'doc-1')).resolves.toBe(false);
  });
});

describe('verifyApiKey', () => {
  const secret = 'a-secret-value-long-enough';
  const token = `vsn_live_0123456789ab_${secret}`;

  it('accepts a valid key and answers with who it acts as', async () => {
    findOne.mockResolvedValue(storedKey());

    await expect(verifyApiKey(token)).resolves.toEqual({
      ok: true,
      userId: 'u1',
      userEmail: 'u1@example.com',
      userName: 'Tester',
      keyId: 'doc-1',
      label: 'Claude Code',
      scopes: ['vision:read']
    });
    expect(findOne).toHaveBeenCalledWith({ keyId: '0123456789ab' });
  });

  it('rejects an unparseable token without touching the database', async () => {
    await expect(verifyApiKey('not-a-key')).resolves.toEqual({
      ok: false,
      rejection: 'malformed'
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['revoked', storedKey({ revokedAt: new Date('2026-01-01') })],
    ['expired', storedKey({ expiresAt: new Date('2020-01-01') })],
    ['bad-secret', storedKey({ hash: sha256('some-other-secret-entirely') })]
  ])('rejects a %s key, and says so only in the return value', async (rejection, stored) => {
    findOne.mockResolvedValue(stored);

    const result = await verifyApiKey(token);

    // Every failure carries the same `ok: false`; the caller answers all of
    // them identically so a client cannot learn which half of a guess was right.
    expect(result).toEqual({ ok: false, rejection });
  });

  it('accepts a key whose expiry is still in the future', async () => {
    findOne.mockResolvedValue(storedKey({ expiresAt: new Date(Date.now() + 60_000) }));

    await expect(verifyApiKey(token)).resolves.toMatchObject({ ok: true });
  });

  it('refreshes lastUsedAt when it is stale', async () => {
    findOne.mockResolvedValue(storedKey({ lastUsedAt: new Date(Date.now() - 120_000) }));

    await verifyApiKey(token);

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'doc-1' },
      { $set: { lastUsedAt: expect.any(Date) } }
    );
  });

  it('skips the write when it was updated a moment ago', async () => {
    // This runs on every request an assistant makes; writing unconditionally
    // turns every read into a write for a field only the listing reads.
    findOne.mockResolvedValue(storedKey({ lastUsedAt: new Date() }));

    await verifyApiKey(token);

    expect(updateOne).not.toHaveBeenCalled();
  });

  it('still authenticates when the bookkeeping write fails', async () => {
    findOne.mockResolvedValue(storedKey());
    updateOne.mockReturnValue(Promise.reject(new Error('mongo is down')));

    await expect(verifyApiKey(token)).resolves.toMatchObject({ ok: true });
  });
});
