/**
 * Date formatting utilities
 */

/**
 * Formats a date string to a consistent format used across the application
 * Format: DD.MM.YYYY HH:mm (e.g., "04.01.2026 14:30")
 */
export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

/**
 * Formats a date string as DD.MM.YYYY (e.g., "04.01.2026") — the compact form
 * used where a narrow screen has no room for the time as well.
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');

  return `${day}.${month}.${date.getFullYear()}`;
};

/**
 * Formats a duration in seconds to a human-readable string
 * @param seconds - Duration in seconds (can be float)
 * @returns Formatted duration string (e.g., "2h 30m", "45m 30s", "30s")
 */
export const formatDuration = (seconds: number): string => {
  // Round to nearest integer to avoid decimal places
  const totalSeconds = Math.round(seconds);

  if (totalSeconds === 0) return '0s';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

  return parts.join(' ');
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
];

/**
 * How long ago a time was, in words ("3 days ago", "yesterday", "just now"): what a card says where a full date and
 * time would be noise. A time in the future reads as "just now", since a clock a little ahead is not news.
 */
export const formatRelativeTime = (dateString: string, now: number = Date.now()): string => {
  const seconds = Math.round((now - new Date(dateString).getTime()) / 1000);
  if (Number.isNaN(seconds) || seconds < 60) return 'just now';
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return formatter.format(-Math.floor(seconds / size), unit);
  }
  return 'just now';
};
