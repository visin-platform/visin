import { requireEnv } from '../../config/env';

const NAME = 'REQUIRE_ENV_TEST_VAR';

afterEach(() => {
  delete process.env[NAME];
});

describe('requireEnv', () => {
  it('returns the value when the variable is set', () => {
    process.env[NAME] = 'some-value';
    expect(requireEnv(NAME)).toBe('some-value');
  });

  it('throws when the variable is missing', () => {
    expect(() => requireEnv(NAME)).toThrow(`Missing required environment variable: ${NAME}`);
  });

  it('throws when the variable is set but empty', () => {
    process.env[NAME] = '';
    expect(() => requireEnv(NAME)).toThrow(`Missing required environment variable: ${NAME}`);
  });
});
