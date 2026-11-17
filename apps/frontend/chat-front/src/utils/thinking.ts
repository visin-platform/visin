import type { Message, RunStep } from '../types/chat';

/** One line of how the analyst worked: something it thought, or something it read. */
export type TrailEntry = { kind: 'thought'; text: string } | { kind: 'read'; tool: string; done: boolean };

/** A finished answer's trail: its notes and its reads, in the order they happened (a note before the reads it explains). */
export function answerTrail(message: Pick<Message, 'thoughts' | 'evidence'>): TrailEntry[] {
  const timed = [
    ...(message.thoughts ?? []).map((t, order) => ({ at: Date.parse(t.at), rank: 0, order, entry: { kind: 'thought', text: t.text } as const })),
    ...message.evidence.map((e, order) => ({ at: Date.parse(e.at), rank: 1, order, entry: { kind: 'read', tool: e.tool, done: true } as const }))
  ];
  timed.sort((a, b) => a.at - b.at || a.rank - b.rank || a.order - b.order);
  return timed.map((t) => t.entry);
}

/** A working run's trail, as its steps arrive. */
export function runTrail(steps: RunStep[] | undefined): TrailEntry[] {
  return (steps ?? []).flatMap((step): TrailEntry[] =>
    step.thought
      ? [{ kind: 'thought', text: step.thought }]
      : step.tool
        ? [{ kind: 'read', tool: step.tool, done: Boolean(step.endedAt) }]
        : []
  );
}

/** "Thinking · 3 sources": what the trail holds, said in a few words. */
export function trailSummary(entries: TrailEntry[]): string {
  const reads = entries.filter((entry) => entry.kind === 'read').length;
  return reads ? `${reads} ${reads === 1 ? 'source' : 'sources'}` : '';
}
