import { spawn } from 'child_process';
import { createServer, type AddressInfo } from 'net';

/** An isolated, nonpersistent Redis on an ephemeral loopback port. No test
 * connects to the developer's Redis or Docker volumes. CI installs redis-server;
 * REDIS_TEST_SERVER may name an extracted/local executable for offline testing. */
export async function startRedis() {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const process = spawn(
    global.process.env.REDIS_TEST_SERVER ?? 'redis-server',
    ['--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new Error(`Redis test server did not start: ${output}`));
    }, 10_000);
    const failed = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    process.once('error', failed);
    process.once('exit', (code) => failed(new Error(`Redis test server exited ${code}: ${output}`)));
    process.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('Ready to accept connections')) {
        clearTimeout(timer);
        resolve();
      }
    });
    process.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
  });
  return {
    url: `redis://127.0.0.1:${port}`,
    stop: async () => {
      if (process.exitCode !== null) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => process.kill('SIGKILL'), 5000);
        process.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
        process.kill('SIGTERM');
      });
    }
  };
}
