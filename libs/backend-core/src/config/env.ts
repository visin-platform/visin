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
