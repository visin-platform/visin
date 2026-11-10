import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

/** Where the dragged element's top-left corner sits, in viewport pixels. */
export interface Position {
  left: number;
  top: number;
}

/** Past this, a press is a drag rather than a tap on whatever is under it. */
const DRAG_THRESHOLD_PX = 6;
/** Kept clear of the screen's edges so the element can always be grabbed again. */
const EDGE_PX = 8;

function readStored(key: string): Position | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Position | null;
    return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
  } catch {
    return null;
  }
}

function store(key: string, position: Position): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(position));
  } catch {
    // Private mode or blocked storage: the position lasts for this page only.
  }
}

/** Inside the viewport, for an element of this size. */
export function clampToViewport(position: Position, width: number, height: number): Position {
  const maxLeft = Math.max(EDGE_PX, window.innerWidth - width - EDGE_PX);
  const maxTop = Math.max(EDGE_PX, window.innerHeight - height - EDGE_PX);
  return {
    left: Math.min(Math.max(position.left, EDGE_PX), maxLeft),
    top: Math.min(Math.max(position.top, EDGE_PX), maxTop)
  };
}

/**
 * Lets a fixed element be dragged anywhere on screen, with mouse or finger,
 * and remembers where it was left on this device.
 *
 * Until it is first moved the element keeps its own CSS placement; `position`
 * is null then. A press that moves less than a few pixels stays a tap, so the
 * buttons inside keep working, and the click that ends a real drag is
 * swallowed so letting go over a button does not press it.
 */
export function useDraggable<T extends HTMLElement>(storageKey: string) {
  const ref = useRef<T>(null);
  const [position, setPosition] = useState<Position | null>(() => readStored(storageKey));
  const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: Position; moved: boolean } | null>(
    null
  );
  const swallowClick = useRef(false);

  // A stored spot from a bigger screen, or a rotated phone, is pulled back into view.
  useEffect(() => {
    const fit = () => {
      const element = ref.current;
      if (!element) return;
      setPosition((current) =>
        current ? clampToViewport(current, element.offsetWidth, element.offsetHeight) : current
      );
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<T>) => {
    if (event.button !== 0 || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { left: rect.left, top: rect.top },
      moved: false
    };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    const current = drag.current;
    const element = ref.current;
    if (!current || !element || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      current.moved = true;
      element.setPointerCapture?.(event.pointerId);
    }
    setPosition(
      clampToViewport(
        { left: current.origin.left + dx, top: current.origin.top + dy },
        element.offsetWidth,
        element.offsetHeight
      )
    );
  }, []);

  const onPointerEnd = useCallback(
    (event: ReactPointerEvent<T>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      if (!current.moved) return;
      // The click, if one comes, follows straight after; a drag that ended off
      // the element gets none, and must not eat the next real tap.
      swallowClick.current = true;
      setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      ref.current?.releasePointerCapture?.(event.pointerId);
      setPosition((latest) => {
        if (latest) store(storageKey, latest);
        return latest;
      });
    },
    [storageKey]
  );

  const onClickCapture = useCallback((event: ReactMouseEvent<T>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  return {
    ref,
    position,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture
    }
  };
}
