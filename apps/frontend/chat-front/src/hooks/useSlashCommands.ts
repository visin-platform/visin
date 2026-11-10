import { useState } from 'react';
import { matchingCommands, type SlashCommand } from '../utils/slashCommands';

/** The command popup of the composer: which commands fit, which is chosen, and moving between them. */
export function useSlashCommands(value: string, enabled: boolean) {
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const options: SlashCommand[] = enabled && dismissed !== value ? matchingCommands(value) : [];
  const index = Math.min(active, Math.max(0, options.length - 1));
  return {
    options,
    active: index,
    chosen: options[index] as SlashCommand | undefined,
    move: (direction: number) => setActive((current) => (current + direction + options.length) % options.length),
    dismiss: () => setDismissed(value),
    // A new text starts at the top again.
    reset: () => setActive(0)
  };
}
