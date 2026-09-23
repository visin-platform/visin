import { sharedSecretMatches } from '../../auth/sharedSecret';

describe('sharedSecretMatches', () => {
  it('matches the configured secret', () => {
    expect(sharedSecretMatches('abcd', 'abcd')).toBe(true);
  });

  it('rejects a different secret of the same length', () => {
    expect(sharedSecretMatches('abce', 'abcd')).toBe(false);
  });

  it('rejects, rather than throws on, a value as long in characters but longer in bytes', () => {
    expect(() => sharedSecretMatches('ébcd', 'abcd')).not.toThrow();
    expect(sharedSecretMatches('ébcd', 'abcd')).toBe(false);
  });

  it('rejects a missing value, a repeated header and an unconfigured secret', () => {
    expect(sharedSecretMatches(undefined, 'abcd')).toBe(false);
    expect(sharedSecretMatches(['abcd', 'abcd'], 'abcd')).toBe(false);
    expect(sharedSecretMatches('', '')).toBe(false);
    expect(sharedSecretMatches('abcd', undefined)).toBe(false);
  });
});
