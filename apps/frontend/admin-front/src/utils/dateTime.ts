const FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  // A 24-hour clock, so "17:43" is never read as a morning or an evening, whatever language the browser is set to.
  hourCycle: 'h23'
});

/**
 * A moment in the viewer's own time zone (the browser's), on a 24-hour clock: "5 Oct 2026, 17:43". The browser's
 * language decides the clock otherwise, and an English one shows a 12-hour AM/PM time even in Tallinn.
 */
export function formatDateTime(value: string | number | Date | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : FORMAT.format(date);
}

const RELATIVE = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
/** Each unit, and how many of it make the next: up to 59 minutes, 23 hours, 6 days, then weeks. */
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', Infinity]
];

/**
 * How long ago a moment was, as a person says it: "just now", "5 minutes ago", "yesterday", "3 weeks ago". Past five
 * weeks the date itself reads better than a count, so it is the date.
 */
export function formatAgo(value: string | number | Date | undefined | null, now = Date.now()): string {
  if (value === undefined || value === null || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  let amount = seconds / 60;
  for (const [unit, size] of STEPS) {
    if (amount < size) return unit === 'week' && amount >= 5 ? formatDateTime(date) : RELATIVE.format(-Math.floor(amount), unit);
    amount /= size;
  }
  return formatDateTime(date);
}
