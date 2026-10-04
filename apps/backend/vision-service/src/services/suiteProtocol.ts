import { createHash } from 'crypto';
import type { SuiteProtocol } from '../validation/suiteSchemas';

/** JSON with every object's keys sorted and no whitespace, so equal values always spell the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The protocol as it is hashed. Lists that are sets (conditions, classes, metrics, sensors) are sorted, because
 * the order a protocol file lists them in changes nothing about a score. Everything else is kept as written.
 */
export function normalizeProtocol(protocol: SuiteProtocol): SuiteProtocol {
  return {
    ...protocol,
    conditions: [...protocol.conditions].sort((a, b) => byText(a.name, b.name)),
    classes: [...protocol.classes].sort((a, b) => byText(a.id, b.id)),
    ignoredClasses: [...protocol.ignoredClasses].sort(byText),
    metrics: [...protocol.metrics].sort((a, b) => byText(a.key, b.key)),
    input: { ...protocol.input, ...(protocol.input.sensors ? { sensors: [...protocol.input.sensors].sort(byText) } : {}) }
  };
}

/**
 * The identity of a protocol: the SHA-256 of its canonical form. A suite's name and description are not part of
 * it, so rewording the page never makes a new version; changing anything that decides a score does.
 */
export function protocolDigest(protocol: SuiteProtocol): string {
  return createHash('sha256').update(canonicalJson(normalizeProtocol(protocol))).digest('hex');
}
