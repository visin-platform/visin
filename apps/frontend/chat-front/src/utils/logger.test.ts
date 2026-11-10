import { afterEach, expect, it, vi } from 'vitest';
import { logger } from './logger';

afterEach(() => vi.restoreAllMocks());

it('reports what could not be done, with its details, to the console', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  logger.warn('Could not switch microphone', { error: 'x' });
  logger.warn('Bare');
  logger.error('Broke', { error: 'y' });
  expect(warn).toHaveBeenNthCalledWith(1, 'Could not switch microphone', { error: 'x' });
  expect(warn).toHaveBeenNthCalledWith(2, 'Bare', '');
  expect(error).toHaveBeenCalledWith('Broke', { error: 'y' });
});
