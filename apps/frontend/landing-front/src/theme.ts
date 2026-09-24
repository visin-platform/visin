import { createVisinTheme } from '@visin/frontend-core';

/** Code, terminal lines and chart axes. */
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** The dark ink the nav, hero and footer are drawn in, as the app's sign-in panel is. */
export const INK = '#111827';

/**
 * The app's theme — its palette, typeface and components — with the landing
 * page's own proportions on top: a 12px shape unit (its `borderRadius: 2` means
 * 24px, where the app's means 8px), larger display headings and a white page.
 *
 * Shown in light only: the page is designed around light sections broken by
 * bands of `INK`, and a visitor in dark mode gets the app in dark once they
 * sign in.
 */
export const theme = createVisinTheme({
  colorSchemes: { light: { palette: { background: { default: '#ffffff' } } } },
  typography: {
    h1: { fontWeight: 800, letterSpacing: '-2px' },
    h2: { fontWeight: 700, letterSpacing: '-1px' },
    h3: { fontWeight: 700, letterSpacing: '-0.5px' },
    h5: { fontWeight: 600 }
  },
  shape: { borderRadius: 12 },
  components: {
    // The app turns these off because its layout brings its own gutters; the
    // landing page's sections are Containers that need theirs.
    MuiContainer: { defaultProps: { disableGutters: false } },
    MuiButton: {
      styleOverrides: {
        sizeLarge: { paddingInline: 28, paddingBlock: 12, fontSize: '1rem' }
      }
    }
  }
});
