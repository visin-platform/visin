/** From the hour on the viewer's own clock. */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstNameOf(name?: string): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/** e.g. "Tuesday, September 15", in the viewer's language. */
export function formatToday(now: Date, locale?: string): string {
  return now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

const DAY = 24 * 60 * 60;
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', 60 * 60],
  ['minute', 60]
];

/** How long ago `iso` was — "3 hours ago", "yesterday" — in the viewer's language. */
export function formatRelative(iso: string, now: Date, locale?: string): string {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  return unit ? format.format(Math.round(seconds / unit[1]), unit[0]) : format.format(0, 'second');
}

/** 1,284 in full; 12.9K once the exact digits stop mattering at a glance. */
export function formatCount(value: number, locale?: string): string {
  const options: Intl.NumberFormatOptions =
    value < 10_000 ? {} : { notation: 'compact', maximumFractionDigits: 1 };
  return new Intl.NumberFormat(locale, options).format(value);
}
