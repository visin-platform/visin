import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

export const LONG_PRESS_MS = 450;
/** A finger that moves this far is scrolling, not pressing. */
const SLOP_PX = 10;

/**
 * A long press with a finger, for a message's menu on touch screens, which have no hover. A mouse and a pen are left
 * alone, so text still selects as usual. The click that ends a long press is swallowed, so a press on a link inside the
 * message opens the menu and does not also follow the link.
 */
export function useLongPress(onLongPress: (target: HTMLElement) => void, enabled = true) {
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const lastTouch = useRef(false);
  const cancel = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  if (!enabled) return {};
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      lastTouch.current = event.pointerType === 'touch';
      fired.current = false;
      cancel();
      if (!lastTouch.current) return;
      const target = event.currentTarget;
      press.current = {
        x: event.clientX,
        y: event.clientY,
        timer: window.setTimeout(() => {
          press.current = null;
          fired.current = true;
          onLongPress(target);
        }, LONG_PRESS_MS)
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = press.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    // Android opens its own menu on the same press.
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (lastTouch.current) event.preventDefault();
    }
  };
}
