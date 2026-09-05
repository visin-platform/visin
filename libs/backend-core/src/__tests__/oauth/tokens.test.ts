import jwt from 'jsonwebtoken';
import {
  ACCESS_TOKEN_TYPE,
  isAccessTokenClaims,
  mintAccessToken,
  parseScopes,
  verifyAccessToken
} from '../../oauth/tokens';

const SECRET = 'test-secret';
const RESOURCE = 'https://mcp.visin.eu';
const ISSUER = 'https://auth-api.visin.eu';

const mint = (over: Partial<Parameters<typeof mintAccessToken>[0]> = {}) =>
  mintAccessToken({
    userId: 'u1',
    email: 'a@b.com',
    name: 'A B',
    resource: RESOURCE,
    issuer: ISSUER,
    scopes: ['vision:read'],
    clientId: 'vsn-client-abc',
    clientName: 'Claude',
    ...over
  });

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

afterAll(() => delete process.env.JWT_SECRET);

describe('mintAccessToken', () => {
  it('binds the token to one resource and marks what kind it is', () => {
    const { accessToken, expiresIn, scope } = mint();
    const claims = jwt.verify(accessToken, SECRET) as Record<string, unknown>;

    expect(claims.aud).toBe(RESOURCE);
    expect(claims.iss).toBe(ISSUER);
    expect(claims.sub).toBe('u1');
    expect(claims.typ).toBe(ACCESS_TOKEN_TYPE);
    expect(scope).toBe('vision:read');
    expect(expiresIn).toBe(3600);
  });

  it('names the client rather than relying on jti', () => {
    // `jti` rotates every hour, so a log built on it would show a different
    // actor each time the assistant refreshed.
    const claims = jwt.verify(mint().accessToken, SECRET) as Record<string, unknown>;

    expect(claims.clientId).toBe('vsn-client-abc');
    expect(claims.clientName).toBe('Claude');
    expect(claims.jti).toEqual(expect.any(String));
  });

  it('gives each token a distinct id', () => {
    const first = jwt.verify(mint().accessToken, SECRET) as { jti: string };
    const second = jwt.verify(mint().accessToken, SECRET) as { jti: string };

    expect(first.jti).not.toBe(second.jti);
  });
});

describe('verifyAccessToken', () => {
  it('accepts a token minted for this resource', () => {
    expect(verifyAccessToken(mint().accessToken, RESOURCE)).toEqual({
      ok: true,
      userId: 'u1',
      email: 'a@b.com',
      name: 'A B',
      scopes: ['vision:read'],
      clientId: 'vsn-client-abc',
      clientName: 'Claude'
    });
  });

  it('refuses a token minted for a different resource', () => {
    // RFC 8707 audience binding: a token obtained for somewhere else must not
    // be replayable here.
    const token = mint({ resource: 'https://mcp.example.com' }).accessToken;

    expect(verifyAccessToken(token, RESOURCE)).toEqual({ ok: false, rejection: 'wrong-audience' });
  });

  it('refuses an ordinary session JWT signed with the same secret', () => {
    // The important one. Same secret, same issuer, but no scopes — read as an
    // access token it would be a session that quietly gets everything.
    const session = jwt.sign({ id: 'u1', email: 'a@b.com' }, SECRET);

    expect(verifyAccessToken(session, RESOURCE)).toEqual({ ok: false, rejection: 'wrong-type' });
  });

  it('refuses a token signed with the wrong secret', () => {
    const forged = jwt.sign({ sub: 'u1', typ: ACCESS_TOKEN_TYPE, aud: RESOURCE }, 'another-secret');

    expect(verifyAccessToken(forged, RESOURCE)).toEqual({ ok: false, rejection: 'bad-signature' });
  });

  it('reports an expired token as expired, not as a bad signature', () => {
    // The client's response differs: expired means refresh, bad signature means
    // something is wrong that refreshing will not fix.
    const expired = jwt.sign(
      { sub: 'u1', typ: ACCESS_TOKEN_TYPE, aud: RESOURCE },
      SECRET,
      { expiresIn: -10 }
    );

    expect(verifyAccessToken(expired, RESOURCE)).toEqual({ ok: false, rejection: 'expired' });
  });

  it('refuses a well-formed token with no subject', () => {
    const noSubject = jwt.sign({ typ: ACCESS_TOKEN_TYPE, aud: RESOURCE }, SECRET);

    expect(verifyAccessToken(noSubject, RESOURCE)).toEqual({ ok: false, rejection: 'malformed' });
  });

  it('surfaces a missing JWT_SECRET as a config fault, not a bad signature', () => {
    // The failure this cost an afternoon: mcp-service was deployed without the
    // secret, requireEnv threw inside the try, and every OAuth-connected
    // assistant was told its perfectly good token had a bad signature.
    const token = mint().accessToken;
    delete process.env.JWT_SECRET;

    expect(() => verifyAccessToken(token, RESOURCE)).toThrow(/JWT_SECRET/);
  });

  it('refuses gibberish', () => {
    expect(verifyAccessToken('not-a-token', RESOURCE).ok).toBe(false);
  });

  it('drops a scope this build does not define', () => {
    // A token minted before a scope was retired must not smuggle it back in.
    const token = jwt.sign(
      { sub: 'u1', typ: ACCESS_TOKEN_TYPE, aud: RESOURCE, scope: 'vision:read made:up' },
      SECRET
    );

    expect(verifyAccessToken(token, RESOURCE).scopes).toEqual(['vision:read']);
  });

  it('copes with a token carrying no scope claim at all', () => {
    const token = jwt.sign({ sub: 'u1', typ: ACCESS_TOKEN_TYPE, aud: RESOURCE }, SECRET);

    expect(verifyAccessToken(token, RESOURCE)).toMatchObject({ ok: true, scopes: [], email: '' });
  });
});

describe('isAccessTokenClaims', () => {
  it.each([
    ['an access token', { typ: ACCESS_TOKEN_TYPE }, true],
    ['a session payload', { id: 'u1' }, false],
    ['null', null, false],
    ['a string', 'nope', false]
  ])('recognises %s', (_label, claims, expected) => {
    expect(isAccessTokenClaims(claims)).toBe(expected);
  });
});

describe('parseScopes', () => {
  it('splits a space-separated scope parameter', () => {
    expect(parseScopes('vision:read dataset:read')).toEqual(['vision:read', 'dataset:read']);
  });

  it('drops anything it does not define, rather than passing it through', () => {
    expect(parseScopes('vision:read admin:everything')).toEqual(['vision:read']);
  });

  it.each([
    ['a non-string', 42],
    ['nothing', undefined],
    ['an empty string', '']
  ])('returns nothing for %s', (_label, value) => {
    expect(parseScopes(value)).toEqual([]);
  });
});
