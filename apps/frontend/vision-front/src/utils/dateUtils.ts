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