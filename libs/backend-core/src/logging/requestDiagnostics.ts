/** Request targets may contain bearer credentials. Never log their query or authority. */
export function safeRequestPath(target: string): string {
  try {
    return new URL(target, 'http://request.invalid').pathname.split(/%3f|%23/i)[0];
  } catch {
    return '[invalid request target]';
  }
}

/** Redact copies of query values as well as URLs embedded in error messages/stacks. */
export function redactRequestDiagnostic(value: string | undefined, target: string): string | undefined {
  if (value === undefined) return undefined;
  const queryStart = target.indexOf('?');
  const query = queryStart < 0 ? '' : target.slice(queryStart + 1).split('#')[0];
  // Parse URLs before substitutions: a query value like "?" must not erase
  // the delimiter that separates a signed URL's path from its credentials.
  let redacted = value.replace(/(?:https?:\/\/[^\s<>"']+|\/\/[^\s<>"']+|\/[^\s<>"']*\?[^\s<>"']*)/gi, (url) => safeRequestPath(url));
  if (query) {
    const secrets = new Set<string>();
    for (const part of query.split('&')) {
      const separator = part.indexOf('=');
      if (separator >= 0) secrets.add(part.slice(separator + 1));
    }
    for (const secret of new URLSearchParams(query).values()) secrets.add(secret);
    // Longest first so overlapping values cannot leave a credential suffix behind.
    for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
      redacted = redacted.split(secret).join('[redacted]');
    }
  }
  return redacted;
}
