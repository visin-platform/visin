import { useEffect, useState } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';

/** Set on the root while a page shows a floating action, to the space the layout leaves for it at the page's end. */
export const FAB_CLEARANCE_VAR = '--visin-fab-clearance';

/** Height the phone tab bar covers at the foot of the screen, above the safe-area inset. */
export const TAB_BAR_HEIGHT = 72;

/**
 * Whether the compact (phone) layout is showing: tab bar, app-bar titles,
 * floating actions. The cut is at `md`, where the rail and a readable content
 * column stop fitting side by side. Read synchronously, so a phone never draws
 * a frame of the desktop layout first.
 */
export function useCompactLayout(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
}

/** Less than this is browser chrome settling, not a keyboard. */
const KEYBOARD_MIN_PX = 80;

/**
 * The height a screen that fills the window should take: all of it, or only the part above the on-screen keyboard
 * while one is up.
 *
 * Android resizes the page for the keyboard where the viewport meta says `interactive-widget=resizes-content`, so
 * `100dvh` already shrinks there. iOS lays the keyboard over the page instead and scrolls the whole page up to keep
 * the focused field in sight, which pushes the bar and the newest messages off the top. Sizing the screen to the
 * visual viewport leaves nothing to scroll: the composer sits on the keyboard and the conversation stays in view.
 * Off (`enabled` false) it is plain `100dvh` and listens to nothing.
 */
export function useKeyboardAwareHeight(enabled = true): string {
  const [height, setHeight] = useState('100dvh');

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!enabled || !viewport) {
      setHeight('100dvh');
      return;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A pinch zoom shrinks the visual viewport too; following it would fight the zoom.
        if (viewport.scale > 1.01) return;
        if (window.innerHeight - viewport.height > KEYBOARD_MIN_PX) {
          setHeight(`${Math.round(viewport.height)}px`);
          // Undo the scroll iOS already made to reveal the field.
          if (window.scrollY !== 0) window.scrollTo(0, 0);
        } else {
          setHeight('100dvh');
        }
      });
    };

    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return height;
}
