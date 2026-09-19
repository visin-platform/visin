import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';

/**
 * The colours of Visin's own chrome — the landing page's: dark ink behind the
 * navigation, one blue for what can be acted on. Exported for the places that
 * have to name a colour outside a theme: the browser's `theme-color`, the
 * manifest, the offline page.
 */
export const VISIN_COLORS = {
  /** Primary: buttons, links, the selected state. */
  brand: '#2563EB',
  /** The app bar across the top of every page (and the phone's status bar); the landing page's ink. */
  appBar: '#111827',
  /** The desktop navigation rail beside the content. */
  rail: '#111827',
  background: '#F6F7FB'
} as const;

/** Below `md` — the compact (phone) layout, as `useCompactLayout` reads it. */
const PHONE = '@media (max-width:899.95px)';

const FONT_STACK = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * The one theme every Visin front renders with — shell, vision, label, account
 * and sign-in — so crossing apps inside the shell never changes the typeface,
 * the blue, or the shape of a button.
 *
 * `shape.borderRadius` stays MUI's 4px unit on purpose: pages across the apps
 * set radii as theme multiples (`borderRadius: 2`), and a larger unit turned
 * those into pills. Components get their rounder corners here instead.
 */
export function createVisinTheme(overrides: ThemeOptions = {}): Theme {
  return createTheme(
    {
      palette: {
        primary: { main: VISIN_COLORS.brand, light: '#60A5FA', dark: '#1D4ED8', contrastText: '#FFFFFF' },
        secondary: { main: '#64748B' },
        success: { main: '#16A34A' },
        warning: { main: '#D97706' },
        error: { main: '#DC2626' },
        info: { main: '#0284C7' },
        background: { default: VISIN_COLORS.background, paper: '#FFFFFF' },
        text: { primary: '#0F172A', secondary: '#475569' },
        divider: '#E2E8F0'
      },
      typography: {
        fontFamily: FONT_STACK,
        h1: { fontWeight: 700, letterSpacing: '-0.02em' },
        h2: { fontWeight: 700, letterSpacing: '-0.02em' },
        h3: { fontWeight: 700, letterSpacing: '-0.02em' },
        // Page titles: MUI's 2.125rem h4 filled a phone's width with two words.
        h4: { fontWeight: 700, letterSpacing: '-0.02em', fontSize: '1.75rem', [PHONE]: { fontSize: '1.375rem' } },
        h5: { fontWeight: 600, [PHONE]: { fontSize: '1.2rem' } },
        h6: { fontWeight: 600 },
        subtitle1: { fontWeight: 600 },
        subtitle2: { fontWeight: 600 },
        button: { textTransform: 'none', fontWeight: 600 }
      },
      shape: { borderRadius: 4 },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }
          }
        },
        // AppLayout's content column already has the page gutters; a Container's
        // own added a second pair, which a phone paid for in width.
        MuiContainer: {
          defaultProps: { disableGutters: true }
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: { root: { borderRadius: 10 } }
        },
        MuiFab: {
          styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } }
        },
        MuiPaper: {
          styleOverrides: {
            rounded: { borderRadius: 12 },
            outlined: { borderColor: '#E2E8F0' }
          }
        },
        MuiCard: {
          defaultProps: { variant: 'outlined' },
          styleOverrides: { root: { borderRadius: 16 } }
        },
        MuiDialog: {
          styleOverrides: { paper: { borderRadius: 16 } }
        },
        MuiMenu: {
          styleOverrides: { paper: { borderRadius: 12 } }
        },
        MuiOutlinedInput: {
          styleOverrides: { root: { borderRadius: 10, backgroundColor: '#FFFFFF' } }
        },
        MuiAlert: {
          styleOverrides: { root: { borderRadius: 10 } }
        },
        MuiChip: {
          styleOverrides: { root: { fontWeight: 500 } }
        },
        MuiTab: {
          styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } }
        },
        MuiTableCell: {
          styleOverrides: {
            root: { borderColor: '#E2E8F0' },
            head: {
              backgroundColor: '#F8FAFC',
              color: '#475569',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }
          }
        },
        MuiLinearProgress: {
          styleOverrides: { root: { borderRadius: 999 }, bar: { borderRadius: 999 } }
        }
      }
    },
    overrides
  );
}
