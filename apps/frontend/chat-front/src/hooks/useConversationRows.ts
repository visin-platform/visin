import { useCallback, useRef, useState, type SetStateAction } from 'react';

/** A late response for another user/thread can never appear under the current header. */
export function useConversationRows<T>(key: string): [T[], (rows: SetStateAction<T[]>) => void] {
  const currentKey = useRef(key);
  currentKey.current = key;
  const [state, setState] = useState<{ key: string; rows: T[] }>({ key, rows: [] });
  const update = useCallback(
    (rows: SetStateAction<T[]>) => {
      if (currentKey.current !== key) return;
      setState((previous) => ({
        key,
        rows: typeof rows === 'function' ? rows(previous.key === key ? previous.rows : []) : rows
      }));
    },
    [key]
  );
  return [state.key === key ? state.rows : [], update];
}
