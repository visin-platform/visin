/** The lib has no logger; calls report what they could not do, and carry on. */
export const logger = {
  warn: (message: string, details?: Record<string, unknown>) => console.warn(message, details ?? ''),
  error: (message: string, details?: Record<string, unknown>) => console.error(message, details ?? '')
};
