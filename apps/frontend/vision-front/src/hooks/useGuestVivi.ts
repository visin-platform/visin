import { useEffect, useState } from 'react';

declare global {
  interface Window {
    /** Whether a visitor may ask Vivi: the shell's answer, set once it has asked chat-service. */
    __visinGuestVivi?: boolean;
  }
}

/**
 * Whether a visitor may ask Vivi from this page: the shell (which owns the chat dock) says so with a flag and an event,
 * as a remote cannot reach its context. Standalone, with no shell, there is no dock to open, so the answer is no.
 */
export function useGuestVivi(): boolean {
  const [available, setAvailable] = useState(() => window.__visinGuestVivi === true);
  useEffect(() => {
    const heard = (event: Event) => setAvailable((event as CustomEvent<boolean>).detail === true);
    window.addEventListener('visin:guest-vivi', heard);
    setAvailable(window.__visinGuestVivi === true);
    return () => window.removeEventListener('visin:guest-vivi', heard);
  }, []);
  return available;
}
