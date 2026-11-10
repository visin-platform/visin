import { ApiError } from '@visin/frontend-core';

/** When a daily allowance returns, in the visitor's own clock: a time today, or a day and time after that. */
export function resetTime(resetAt?: string, now = new Date()): string {
  const at = resetAt ? new Date(resetAt) : null;
  if (!at || Number.isNaN(at.getTime())) return 'tomorrow';
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return at.toDateString() === now.toDateString()
    ? time
    : `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/**
 * What to tell a visitor whose question was not accepted, by which limit said no: their own allowance, their network's,
 * asking too quickly, the shared pause, or every slot being busy. Never promises that signing in lifts a shared pause.
 */
export function refusalMessage(error: unknown, dailyLimit: number): string {
  if (error instanceof ApiError) {
    const body = (error.body ?? {}) as { reason?: string; resetAt?: string };
    if (error.status === 429) {
      switch (body.reason) {
        case 'session':
          return `You've used today's ${dailyLimit} questions. Sign in to keep going, or come back after ${resetTime(body.resetAt)}.`;
        case 'network':
          return `Too many questions have come from your network today. Sign in to keep going, or try again after ${resetTime(body.resetAt)}.`;
        case 'burst':
          return 'You are asking quickly. Wait a minute, then ask again.';
        case 'capacity':
          return 'Vivi is busy answering other visitors. Try again in a minute.';
        default:
          return 'Guest questions are paused right now. Please try again later.';
      }
    }
    if (error.status === 403 && /verif/i.test(error.message)) return 'Please complete the check again.';
  }
  return error instanceof Error ? error.message : 'Could not submit the question';
}
