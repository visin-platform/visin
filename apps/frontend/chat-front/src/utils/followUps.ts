import type { PageContext } from '../types/chat';
import { starters } from './chatContext';

/** Questions that fit after any answer, for when what suits this page has been asked already. */
const ANYTIME = ['Explain that in simpler terms', 'What should I check before trusting this?'];

/**
 * Up to three next questions worth one click after an answer. The ones the analyst offered with that answer come
 * first: they are about what it just found. What suits the page being analysed fills the rest, minus anything
 * already asked in this thread.
 */
export function followUps(context: PageContext | undefined, asked: string[], suggested: string[] = []): string[] {
  const used = new Set(asked.map((question) => question.trim().toLowerCase()));
  return [...new Set([...suggested, ...starters(context), ...ANYTIME])]
    .filter((text) => !used.has(text.trim().toLowerCase()))
    .slice(0, 3);
}
