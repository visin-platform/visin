import {
  API_KEY_SCOPES,
  isApiKeyScope,
  readScope,
  writeScope,
  type ApiKeyDomain
} from '../../apiKeys/types';

describe('API_KEY_SCOPES', () => {
  it('pairs a read and a write scope for every domain', () => {
    // The interesting key is the read-only one; a domain with only a write
    // scope would have no way to express "answer questions, change nothing".
    const domains: ApiKeyDomain[] = ['vision', 'dataset', 'label', 'analysis'];

    for (const domain of domains) {
      expect(API_KEY_SCOPES).toContain(readScope(domain));
      expect(API_KEY_SCOPES).toContain(writeScope(domain));
    }
    expect(API_KEY_SCOPES).toHaveLength(domains.length * 2);
  });
});

describe('isApiKeyScope', () => {
  it.each(API_KEY_SCOPES)('accepts %s', (scope) => {
    expect(isApiKeyScope(scope)).toBe(true);
  });

  it.each([
    ['a scope from another product', 'relationship:read'],
    ['a domain with no verb', 'vision'],
    ['a verb we do not grant', 'vision:admin'],
    ['a non-string', 42],
    ['nothing at all', undefined]
  ])('rejects %s', (_label, value) => {
    expect(isApiKeyScope(value)).toBe(false);
  });
});

describe('readScope / writeScope', () => {
  it('build the scope names the middleware gates on', () => {
    expect(readScope('vision')).toBe('vision:read');
    expect(writeScope('label')).toBe('label:write');
  });
});
