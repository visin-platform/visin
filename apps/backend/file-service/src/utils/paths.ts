import path from 'node:path';
import { BadRequestError } from '@visin/backend-core';
export const dataDir = (): string => path.resolve(process.env.FILE_SERVICE_DATA_DIR || '/data');
export const CONTROL_DIRECTORY = '.uploads';
// A caller-supplied path is client input: rejecting it is a 400, not a server fault.
export const resolvePath = (fileId: string): string => {
  const root = dataDir();
  const resolved = path.resolve(root, fileId);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new BadRequestError('Invalid path: escapes data directory');
  if (path.relative(root, resolved).split(path.sep)[0] === CONTROL_DIRECTORY) throw new BadRequestError('Reserved storage path');
  return resolved;
};
