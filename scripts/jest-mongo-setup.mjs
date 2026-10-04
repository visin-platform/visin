import requireVmModules from './jest-need-vm-modules.cjs';
import mongoMemoryServer from 'mongodb-memory-server';

export default async function setup() {
  await requireVmModules();
  // Match Compose by default; a deliberate MONGOMS_VERSION override also applies
  // to every suite. Download outside test-hook timeouts and before Jest creates
  // isolated module registries, whose same-PID locks can race on a cold cache.
  process.env.MONGOMS_VERSION ??= '8.3.9';
  const version = process.env.MONGOMS_VERSION;
  try {
    const binary = await mongoMemoryServer.MongoBinary.getPath({ version });
    // Workers inherit one resolved executable. They must never start a second
    // download if their isolated module state cannot find the prepared cache.
    process.env.MONGOMS_SYSTEM_BINARY = binary;
    process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
  } catch (cause) {
    // Jest prints the outer error's stack without its cause, so keep the useful
    // download/path error in the message too.
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not prepare MongoDB ${version} before starting Jest suites: ${reason}`, { cause });
  }
}
