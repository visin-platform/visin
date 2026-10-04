/**
 * An address this deployment says is public, from its own settings only. There is no built-in default: a self-hosted
 * Visin must never point its users at someone else's.
 */
export const configuredUrl = (name: string): string | undefined => process.env[name]?.trim().replace(/\/+$/, '') || undefined;
