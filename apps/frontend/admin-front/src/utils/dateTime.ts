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
