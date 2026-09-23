import { requireEnv, assertRequiredEnv } from '../../config/env';
import { logger } from '../../logging/logger';

jest.mock('../../logging/logger', () => ({ logger: { error: jest.fn() } }));

const NAME = 'REQUIRE_ENV_TEST_VAR';
const OTHER = 'REQUIRE_ENV_TEST_VAR_2';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  delete process.env[NAME];
  delete process.env[OTHER];
  process.env.NODE_ENV = originalNodeEnv;
  jest.restoreAllMocks();
  jest.clearAllMocks();
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

describe('assertRequiredEnv', () => {
  const mockExit = () => jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

  it('returns without exiting when every variable is set', () => {
    process.env[NAME] = 'a';
    process.env[OTHER] = 'b';
    const exit = mockExit();

    assertRequiredEnv([NAME, OTHER]);

    expect(exit).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('exits listing every missing variable, not just the first', () => {
    const exit = mockExit();

    assertRequiredEnv([NAME, OTHER]);

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), { missing: [NAME, OTHER] });
  });

  it('treats an empty value as missing', () => {
    process.env[NAME] = '';
    process.env[OTHER] = 'set';
    const exit = mockExit();

    assertRequiredEnv([NAME, OTHER]);

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), { missing: [NAME] });
  });

  it('does nothing for an empty list', () => {
    const exit = mockExit();
    assertRequiredEnv([]);
    expect(exit).not.toHaveBeenCalled();
  });

  it.each(['dev-only-jwt-secret-change-before-exposing', '<change-me>'])(
    'exits in production when a variable still holds the placeholder %p',
    placeholder => {
      process.env.NODE_ENV = 'production';
      process.env[NAME] = placeholder;
      process.env[OTHER] = 'a-real-secret';
      const exit = mockExit();

      assertRequiredEnv([NAME, OTHER]);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('placeholder'), { placeholders: [NAME] });
      expect(exit).toHaveBeenCalledWith(1);
    }
  );

  it('accepts the placeholders outside production, so the zero-config stack still boots', () => {
    process.env.NODE_ENV = 'development';
    process.env[NAME] = 'dev-only-jwt-secret-change-before-exposing';
    const exit = mockExit();

    assertRequiredEnv([NAME]);

    expect(exit).not.toHaveBeenCalled();
  });
});
