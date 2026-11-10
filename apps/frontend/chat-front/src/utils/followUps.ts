import type { PageContext } from '../types/chat';
import { starters } from './chatContext';

/** Questions that fit after any answer, for when what suits this page has been asked already. */
const ANYTIME = ['Explain that in simpler terms', 'What should I check before trusting this?'];

/**
 * Up to three next questions worth one click after an answer: what suits what is being analysed, minus what was
 * already asked in this thread.
 */
export function followUps(context: PageContext | undefined, asked: string[]): string[] {
  const used = new Set(asked.map((question) => question.trim().toLowerCase()));
  return [...new Set([...starters(context), ...ANYTIME])].filter((text) => !used.has(text.toLowerCase())).slice(0, 3);
}
