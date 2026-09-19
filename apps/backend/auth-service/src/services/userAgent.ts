// Order matters: Edge, Opera and Samsung Internet all also claim Chrome and
// Safari, and Chrome claims Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari']
];

// iOS before macOS (an iPhone claims "like Mac OS X"), Android before Linux.
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux']
];

const firstMatch = (ua: string, rules: [RegExp, string][]): string | undefined =>
  rules.find(([pattern]) => pattern.test(ua))?.[1];

/**
 * A human label for a signed-in device, e.g. "Chrome on Android". Only ever
 * shown to the account's own owner so they can recognise their sessions; it
 * is a hint, not an identity, and nothing decides anything on it.
 */
export function describeUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device';
  const browser = firstMatch(userAgent, BROWSERS);
  const system = firstMatch(userAgent, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}
