import type { Run } from '../types/chat';

export interface FailureNote {
  text: string;
  /** Whether asking again can help. A used-up day, a switched-off assistant or a lost view will fail the same way. */
  retry: boolean;
}

/** When the daily allowance resets: the server's time, in the reader's own clock and zone. */
export function resetTime(resetsAt: string | undefined, now = new Date()): string | undefined {
  const at = resetsAt ? new Date(resetsAt) : undefined;
  if (!at || Number.isNaN(at.getTime())) return undefined;
  const sameDay = at.toDateString() === now.toDateString();
  return at.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(sameDay ? {} : { weekday: 'short' })
  });
}

/**
 * What to tell the person about a failed question, and whether to offer Try again. The server's own sentence is kept
 * for what has no code, or one this page does not know: a newer server may say more than this page can.
 */
export function failureNote(run: Pick<Run, 'error' | 'failureCode'>, resetsAt?: string): FailureNote {
  const server = run.error || 'The analysis failed.';
  switch (run.failureCode) {
    case 'limit_reached': {
      const when = resetTime(resetsAt);
      return {
        text: `You have used today’s Vivi allowance. It resets ${when ? `at ${when} (your time)` : 'at midnight UTC'}.`,
        retry: false
      };
    }
    case 'busy':
      return {
        text: 'Your other questions to Vivi are still running and hold the rest of today’s allowance. Try again when they finish.',
        retry: true
      };
    case 'assistant_off':
      return {
        text: 'Vivi is not available right now. Ask a platform administrator to check the Analyst settings.',
        retry: false
      };
    case 'access_changed':
      return {
        text: 'Vivi’s access or terms changed while it was answering. If chat asks you to accept its terms again, do so, then try again.',
        retry: true
      };
    case 'no_access':
      return {
        text: 'You can no longer see what this question was about. Ask again without it, or check with its owner.',
        retry: false
      };
    case 'too_large': {
      // The server's own words end by asking for a narrower question: say it once, whichever way it was put.
      const said = server.replace(/\s*Ask a (narrower|shorter) question\.?$/i, '').replace(/\.?$/, '.');
      return { text: `${said} Ask a narrower question.`, retry: false };
    }
    case 'image':
      // The same image fails the same way: the server says which limit, and a different image is the way on.
      return { text: server, retry: false };
    case 'interrupted':
      return { text: 'Vivi was interrupted before it finished. Try again.', retry: true };
    case 'timeout':
      return { text: 'Vivi took too long to answer. Try again, or ask something narrower.', retry: true };
    case 'provider_error':
      return { text: server, retry: true };
    case 'stopped':
      return { text: 'This question was stopped.', retry: true };
    default:
      return { text: server, retry: true };
  }
}
