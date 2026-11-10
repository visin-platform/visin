/** Follow browser language and timezone, with the regional 24-hour convention for European timezones.
 * An English (US) browser in Tallinn should still show 23:27 instead of 11:27 PM.
 */
function regionalOptions(timeZone: string): Intl.DateTimeFormatOptions {
  return {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone.startsWith('Europe/') ? { hourCycle: 'h23' as const } : {})
  };
}

export function formatChatTime(
  value: string,
  locales: string | readonly string[] = navigator.languages,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
): string {
  return new Intl.DateTimeFormat(locales, regionalOptions(timeZone)).format(new Date(value));
}

export function formatChatDateTime(
  value: string,
  locales: string | readonly string[] = navigator.languages,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
): string {
  return new Intl.DateTimeFormat(locales, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    ...regionalOptions(timeZone)
  }).format(new Date(value));
}
