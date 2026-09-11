import path from 'node:path';
export const dataDir = (): string => path.resolve(process.env.FILE_SERVICE_DATA_DIR || '/data');
export const CONTROL_DIRECTORY = '.uploads';
export const resolvePath = (fileId: string): string => {
  const root = dataDir();
  const resolved = path.resolve(root, fileId);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('Invalid path: escapes data directory');
  if (path.relative(root, resolved).split(path.sep)[0] === CONTROL_DIRECTORY) throw new Error('Reserved storage path');
  return resolved;
};
