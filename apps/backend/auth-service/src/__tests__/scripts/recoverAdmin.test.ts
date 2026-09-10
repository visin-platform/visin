jest.mock('mongoose', () => ({
  __esModule: true,
  default: { connect: jest.fn(), disconnect: jest.fn() },
}));
jest.mock('../../services/bootstrapService', () => ({ recoverAdministrator: jest.fn() }));

import mongoose from 'mongoose';
import { recoverAdministrator } from '../../services/bootstrapService';

const id = '507f1f77bcf86cd799439011';
const originalArgv = process.argv;
const originalUri = process.env.MONGODB_URI;
const originalExitCode = process.exitCode;

beforeEach(() => {
  jest.clearAllMocks();
  process.argv = ['node', 'recoverAdmin.js', id];
  process.env.MONGODB_URI = 'mongodb://test.invalid/test';
  process.exitCode = undefined;
  (mongoose.connect as jest.Mock).mockResolvedValue(undefined);
  (mongoose.disconnect as jest.Mock).mockResolvedValue(undefined);
  (recoverAdministrator as jest.Mock).mockResolvedValue({ _id: { toString: () => id } });
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  if (originalUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = originalUri;
});

async function runCommand() {
  await jest.isolateModulesAsync(async () => {
    // Share the test doubles with the isolated command instance.
    jest.doMock('mongoose', () => ({ __esModule: true, default: mongoose }));
    jest.doMock('../../services/bootstrapService', () => ({ recoverAdministrator }));
    await (await import('../../scripts/recoverAdmin')).completion;
  });
}

it('recovers the selected identity and always closes its database connection', async () => {
  await runCommand();
  expect(recoverAdministrator).toHaveBeenCalledWith(id);
  expect(mongoose.connect).toHaveBeenCalledWith('mongodb://test.invalid/test');
  expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  expect(console.info).toHaveBeenCalledWith(`Administrator role restored for user ${id}`);
  expect(process.exitCode).toBeUndefined();
});

it.each([[], [id, 'extra']])('rejects invalid arguments %j before accessing the database', async (...args) => {
  process.argv = ['node', 'recoverAdmin.js', ...args];
  await runCommand();
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  expect(mongoose.connect).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it('requires explicit database configuration', async () => {
  delete process.env.MONGODB_URI;
  await runCommand();
  expect(console.error).toHaveBeenCalledWith('MONGODB_URI is required');
  expect(mongoose.connect).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it('reports recovery failures with a nonzero exit and closes the connection', async () => {
  (recoverAdministrator as jest.Mock).mockRejectedValueOnce(new Error('User not found'));
  await runCommand();
  expect(console.error).toHaveBeenCalledWith('User not found');
  expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  expect(process.exitCode).toBe(1);
});

it('also closes the connection after a failed connection attempt', async () => {
  (mongoose.connect as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'));
  await runCommand();
  expect(recoverAdministrator).not.toHaveBeenCalled();
  expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  expect(process.exitCode).toBe(1);
});
