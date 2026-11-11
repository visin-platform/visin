import { useEffect, useRef, useState } from 'react';

interface Turnstile {
  render: (
    element: HTMLElement,
    options: { sitekey: string; action: string; callback: (token: string) => void; 'expired-callback': () => void }
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/**
 * Cloudflare Turnstile's bot check, for a guest question. It draws only once `wanted` (the visitor has begun typing),
 * so a visitor who is only looking sees no widget, and the check's script is not even loaded for them.
 * `token` is the current proof, or empty; `reset` asks for a fresh one after it was spent.
 */
export function useTurnstile(siteKey: string | undefined, wanted: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState('');
  useEffect(() => {
    if (!siteKey || !wanted || !container.current) {
      setToken('');
      return;
    }
    let alive = true;
    const render = () => {
      if (alive && container.current && window.turnstile && widget.current === null)
        widget.current = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action: 'vivi-guest',
          callback: (value) => {
            if (alive) setToken(value);
          },
          'expired-callback': () => {
            if (alive) setToken('');
          }
        });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-visin-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.visinTurnstile = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    render();
    return () => {
      alive = false;
      script?.removeEventListener('load', render);
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, wanted]);
  const reset = () => {
    setToken('');
    if (widget.current !== null) window.turnstile?.reset(widget.current);
  };
  return { container, token, reset };
}
