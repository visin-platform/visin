import mongoose from 'mongoose';
import { AuthorizationCode, OAuthClient, RefreshToken } from '../../oauth/models';

/**
 * Schema-level checks only — no connection is opened. What is worth pinning is
 * the shape these are stored in, because a couple of the fields carry a
 * security decision rather than just data.
 */
describe('OAuth models', () => {
  it('are each registered once, so a second import does not overwrite them', () => {
    expect(mongoose.models.OAuthClient).toBe(OAuthClient);
    expect(mongoose.models.AuthorizationCode).toBe(AuthorizationCode);
    expect(mongoose.models.RefreshToken).toBe(RefreshToken);
  });

  it('keep each kind in its own collection', () => {
    expect(OAuthClient.collection.name).toBe('oauth_clients');
    expect(AuthorizationCode.collection.name).toBe('oauth_authorization_codes');
    expect(RefreshToken.collection.name).toBe('oauth_refresh_tokens');
  });

  it('lets Mongo sweep expired authorization codes', () => {
    // A code nobody cleans up is a record a replay can keep being attempted
    // against.
    const ttlIndex = AuthorizationCode.schema
      .indexes()
      .find(([fields]: [Record<string, unknown>, Record<string, unknown>]) => 'expiresAt' in fields);

    expect(ttlIndex?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });

  it('requires everything a code exchange checks', async () => {
    await expect(new AuthorizationCode({}).validate()).rejects.toMatchObject({
      errors: {
        code: expect.anything(),
        clientId: expect.anything(),
        userId: expect.anything(),
        userEmail: expect.anything(),
        redirectUri: expect.anything(),
        resource: expect.anything(),
        // Without this there is no PKCE, and a public client is an intercepted
        // code away from being impersonated.
        codeChallenge: expect.anything(),
        expiresAt: expect.anything()
      }
    });
  });

  it('requires a refresh token to carry its digest, owner and resource', async () => {
    await expect(new RefreshToken({}).validate()).rejects.toMatchObject({
      errors: {
        tokenHash: expect.anything(),
        clientId: expect.anything(),
        userId: expect.anything(),
        resource: expect.anything()
      }
    });
  });

  it('defaults a grant to no scopes rather than to something convenient', () => {
    const token = new RefreshToken({
      tokenHash: 'h',
      clientId: 'c',
      userId: 'u1',
      resource: 'https://mcp.visin.eu'
    });

    expect(token.scopes).toEqual([]);
    expect(token.grantedAt).toBeInstanceOf(Date);
  });

  it('caps a client name and requires its redirect URIs', async () => {
    await expect(new OAuthClient({}).validate()).rejects.toMatchObject({
      errors: { clientId: expect.anything(), clientName: expect.anything() }
    });

    const tooLong = new OAuthClient({
      clientId: 'c',
      clientName: 'x'.repeat(201),
      redirectUris: ['https://a/cb']
    });
    await expect(tooLong.validate()).rejects.toMatchObject({
      errors: { clientName: expect.anything() }
    });
  });
});
