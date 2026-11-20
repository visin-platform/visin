import type { Message, RunStep } from '../types/chat';

/** One line of how the analyst worked: something it thought, or something it read. */
export type TrailEntry =
  | { kind: 'thought'; text: string }
  | { kind: 'read'; tool: string; done: boolean; /** the words a search used */ detail?: string };

/**
 * The words a search used, from what it was asked. The same reading the server makes for a live step, so a finished
 * answer shows what a running one did. Plain text, cut short.
 */
export function searchWords(tool: string, input: Record<string, unknown> | undefined): string | undefined {
  const args = input ?? {};
  const words =
    tool === 'search_visin' && Array.isArray(args.terms)
      ? args.terms.filter((term): term is string => typeof term === 'string').join(', ')
      : ['list_projects', 'list_datasets', 'list_papers'].includes(tool)
        ? args.search
        : tool === 'search_paper'
          ? args.query
          : undefined;
  const text = typeof words === 'string' ? words.replace(/\s+/g, ' ').trim() : '';
  return text ? (text.length > 80 ? `${text.slice(0, 79)}…` : text) : undefined;
}

/** A finished answer's trail: its notes and its reads, in the order they happened (a note before the reads it explains). */
export function answerTrail(message: Pick<Message, 'thoughts' | 'evidence'>): TrailEntry[] {
  const timed = [
    ...(message.thoughts ?? []).map((t, order) => ({ at: Date.parse(t.at), rank: 0, order, entry: { kind: 'thought', text: t.text } as const })),
    ...message.evidence.map((e, order) => ({ at: Date.parse(e.at), rank: 1, order, entry: { kind: 'read', tool: e.tool, done: true, detail: searchWords(e.tool, e.input) } as const }))
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
        ? [{ kind: 'read', tool: step.tool, done: Boolean(step.endedAt), ...(step.detail ? { detail: step.detail } : {}) }]
        : []
  );
}

/** "Thinking · 3 sources": what the trail holds, said in a few words. */
export function trailSummary(entries: TrailEntry[]): string {
  const reads = entries.filter((entry) => entry.kind === 'read').length;
  return reads ? `${reads} ${reads === 1 ? 'source' : 'sources'}` : '';
}
