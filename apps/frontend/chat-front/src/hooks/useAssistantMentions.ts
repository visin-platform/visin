import { useEffect, useRef, useState } from 'react';
import type { SharedAssistant } from '../types/assistant';

/** Text is display-only: only an explicit suggestion selection chooses a recipient ID. */
export function useAssistantMentions(
  value: string,
  assistants: SharedAssistant[],
  selectedId: string | undefined,
  choose?: (id: string) => void
) {
  const [caret, setCaret] = useState(value.length);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const inserted = useRef<{ id: string; start: number; token: string } | undefined>(undefined);
  const position = Math.min(caret, value.length);
  const match = /(?:^|\s)@([^@\n]*)$/.exec(value.slice(0, position));
  const start = match ? position - match[1].length - 1 : position;
  const key = `${value}:${position}`;
  const options =
    choose && match && dismissed !== key
      ? assistants
          .filter(
            (bot) =>
              bot.available &&
              bot.name.toLocaleLowerCase().startsWith(match[1].toLocaleLowerCase()) &&
              value.length - (position - start) + bot.name.length + 2 <= 8000
          )
          .slice(0, 5)
      : [];
  useEffect(() => {
    const mention = inserted.current;
    if (!mention) return;
    if (selectedId !== mention.id) inserted.current = undefined;
    else if (value.slice(mention.start, mention.start + mention.token.length) !== mention.token) {
      inserted.current = undefined;
      choose?.('');
    }
  }, [value, selectedId, choose]);
  const select = (bot: SharedAssistant) => {
    const token = `@${bot.name}`;
    const next = `${value.slice(0, start)}${token} ${value.slice(position)}`;
    inserted.current = { id: bot.id, start, token };
    choose?.(bot.id);
    setCaret(start + token.length + 1);
    setDismissed(`${next}:${start + token.length + 1}`);
    setActive(0);
    return { value: next, caret: start + token.length + 1 };
  };
  return {
    options,
    active: Math.min(active, Math.max(0, options.length - 1)),
    select,
    move: (direction: number) => setActive((index) => (index + direction + options.length) % options.length),
    locate: (position: number) => {
      setCaret(position);
      setActive(0);
    },
    dismiss: () => setDismissed(key)
  };
}
