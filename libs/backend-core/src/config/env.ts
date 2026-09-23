import { logger } from '../logging/logger';

/**
 * Returns the value of a required environment variable.
 * Throws if the variable is missing or empty — call at service startup
 * (after dotenv.config()) so misconfigured services fail fast instead of
 * running with insecure defaults.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Startup gate: logs *every* missing variable at once and exits, so a
 * misconfigured deployment dies at boot with an actionable list instead of
 * booting healthy and failing later — e.g. a service without
 * `INTERNAL_SERVICE_TOKEN` answers `/health` fine and then 500s on every
 * internal call, turning a config error into what looks like an outage.
 *
 * Call it as the first statement in a service's `index.ts`. Reports all
 * missing names rather than the first, so fixing the config is one
 * round-trip instead of one redeploy per variable.
 */
export function assertRequiredEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]);
  // The root compose.yml boots with `dev-only-…` secrets so a fresh clone runs
  // as-is, and each .env.example ships `<change-me>`. Either one in production
  // is a secret anyone can read in this repository.
  const placeholders = process.env.NODE_ENV === 'production'
    ? names.filter((name) => isPlaceholderSecret(process.env[name]))
    : [];
  if (missing.length === 0 && placeholders.length === 0) return;

  if (missing.length > 0) {
    logger.error('Fatal: missing required environment variables', { missing });
  }
  if (placeholders.length > 0) {
    logger.error('Fatal: development placeholder values in production; set real secrets', { placeholders });
  }
  process.exit(1);
}

function isPlaceholderSecret(value: string | undefined): boolean {
  return value !== undefined && (value.startsWith('dev-only-') || value === '<change-me>');
}
