import mongoose from 'mongoose';
import { ApiKey } from '../../apiKeys/ApiKey';

/**
 * Schema-level checks only — no connection is opened. What is worth pinning
 * here is the shape a key is stored in, because the defaults encode decisions:
 * a key with no scopes must not quietly inherit one.
 */
describe('ApiKey model', () => {
  it('is registered once, so a second import does not overwrite it', () => {
    // Several services import this module; mongoose throws OverwriteModelError
    // on a re-registration, which would surface as a service that boots in
    // dev and dies under a test runner that resets modules.
    expect(mongoose.models.ApiKey).toBe(ApiKey);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('../../apiKeys/ApiKey').ApiKey).toBe(ApiKey);
  });

  it('stores keys in the api_keys collection', () => {
    expect(ApiKey.collection.name).toBe('api_keys');
  });

  it('defaults a key to no scopes rather than to something convenient', () => {
    const key = new ApiKey({
      userId: 'u1',
      userEmail: 'u1@example.com',
      name: 'Claude Code',
      keyId: '0123456789ab',
      hash: 'h',
      sealedCiphertext: 'c',
      sealedIv: 'i',
      sealedTag: 't'
    });

    expect(key.scopes).toEqual([]);
    expect(key.revealCount).toBe(0);
    expect(key.userName).toBe('');
  });

  it('requires everything verification depends on', async () => {
    await expect(new ApiKey({}).validate()).rejects.toMatchObject({
      errors: {
        userId: expect.anything(),
        userEmail: expect.anything(),
        name: expect.anything(),
        keyId: expect.anything(),
        hash: expect.anything(),
        sealedCiphertext: expect.anything(),
        sealedIv: expect.anything(),
        sealedTag: expect.anything()
      }
    });
  });

  it('caps the name a person gives a key', async () => {
    const key = new ApiKey({
      userId: 'u1',
      userEmail: 'u1@example.com',
      name: 'x'.repeat(61),
      keyId: '0123456789ab',
      hash: 'h',
      sealedCiphertext: 'c',
      sealedIv: 'i',
      sealedTag: 't'
    });

    await expect(key.validate()).rejects.toMatchObject({
      errors: { name: expect.anything() }
    });
  });
});
