import type { Conversation, Run } from '../types/chat';

const WORKING = ['queued', 'running'];

/** Whether the person may stop what is being answered: it is working, and it is theirs (or this is their own thread). */
export function stoppable(runs: Run[], conversation: Pick<Conversation, 'kind'> | undefined, userId: string | undefined): boolean {
  return runs.some(
    (run) => WORKING.includes(run.state) && (run.canCancel ?? (conversation?.kind === 'assistant' || run.userId === userId))
  );
}
