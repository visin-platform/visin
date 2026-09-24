import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';
import { brand, glass, ink, raisedShadow, schemeCssVars, schemes, surface } from './tokens';

// Tells MUI's types the theme carries CSS variables and both colour schemes,
// which is what exposes `theme.vars` and the provider's scheme props. Shipped in
// this package's types, so every front picks it up.
declare module '@mui/material/styles' {
  interface CssThemeVariables {
    enabled: true;
  }
}

/** Below `md` — the compact (phone) layout, as `useCompactLayout` reads it. */
const PHONE = '@media (max-width:899.95px)';

/**
 * Below `sm` — a phone held upright, where a thumb does the pointing. 44px is
 * the WCAG 2.2 target size and both platforms' minimum; MUI's 36px button is a
 * miss often enough to feel broken.
 */
const HANDHELD = '@media (max-width:599.95px)';
const TOUCH_TARGET = 44;

const FONT_STACK = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** The attribute on <html> that says which scheme is showing: `light` or `dark`. */
export const COLOR_SCHEME_ATTRIBUTE = 'data-color-scheme';

/**
 * Where the person's choice (`system`, `light` or `dark`) is kept. Named rather
 * than MUI's default, so the pre-paint script in each index.html reads the same key.
 */
export const COLOR_MODE_STORAGE_KEY = 'visin-mode';
export const COLOR_SCHEME_STORAGE_KEY = 'visin-color-scheme';

/**
 * The colours named outside a React tree: `theme-color` in each index.html,
 * the manifest, the offline page.
 */
export const VISIN_COLORS = {
  /** Primary: buttons, links, the selected state. */
  brand: brand.light,
  themeColor: schemes.light.themeColor,
  themeColorDark: schemes.dark.themeColor,
  background: schemes.light.surface.default
} as const;

const lightPalette = {
  primary: { main: brand.light, light: '#60a5fa', dark: '#1d4ed8', contrastText: '#ffffff' },
  secondary: { main: '#64748b' },
  success: { main: '#15803d' },
  warning: { main: '#b45309' },
  error: { main: '#dc2626' },
  info: { main: '#0369a1' },
  background: { default: schemes.light.surface.default, paper: schemes.light.surface.paper },
  text: { primary: schemes.light.ink.strong, secondary: schemes.light.ink.body, disabled: schemes.light.ink.faint },
  divider: schemes.light.surface.divider
};

/**
 * Walked *up* for dark: the light scheme's blue is 3.1:1 on the dark paper, so
 * anything readable gets a lighter one, with dark text on it as a button fill.
 */
const darkPalette = {
  primary: { main: brand.dark, light: '#93c5fd', dark: '#3b82f6', contrastText: '#0b1220' },
  secondary: { main: '#94a3b8' },
  success: { main: '#4ade80' },
  warning: { main: '#fbbf24' },
  error: { main: '#f87171' },
  info: { main: '#38bdf8' },
  background: { default: schemes.dark.surface.default, paper: schemes.dark.surface.paper },
  text: { primary: schemes.dark.ink.strong, secondary: schemes.dark.ink.body, disabled: schemes.dark.ink.faint },
  divider: schemes.dark.surface.divider
};

/**
 * The one theme every Visin front renders with — shell, vision, label, account
 * and sign-in — so crossing apps inside the shell never changes the typeface,
 * the blue, the scheme or the shape of a button.
 *
 * Colours are CSS variables switched by an attribute on <html>. That is what
 * makes one switch reach every front: the remotes are federated into the
 * shell's page, so they all read the same attribute. It also means
 * `theme.palette` holds the *light* values in both schemes; code that needs a
 * colour in JS reads `theme.vars.palette` (or `useActivePalette` for a real
 * value, e.g. a chart series).
 *
 * `shape.borderRadius` stays MUI's 4px unit on purpose: pages across the apps
 * set radii as theme multiples (`borderRadius: 2`), and a larger unit turned
 * those into pills. Components get their rounder corners here instead.
 */
export function createVisinTheme(overrides: ThemeOptions = {}): Theme {
  return createTheme(
    {
      cssVariables: { colorSchemeSelector: COLOR_SCHEME_ATTRIBUTE },
      colorSchemes: { light: { palette: lightPalette }, dark: { palette: darkPalette } },
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
            // The tokens pages use (`ink.muted`, `surface.sunken`, `glass`…) are
            // variables; these are their values in each scheme. The attribute
            // also works on an element, not only <html>, so a region can pin
            // itself to one scheme.
            [`:root, [${COLOR_SCHEME_ATTRIBUTE}="light"]`]: schemeCssVars('light'),
            [`:root[${COLOR_SCHEME_ATTRIBUTE}="dark"], [${COLOR_SCHEME_ATTRIBUTE}="dark"]`]: schemeCssVars('dark'),
            body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
            '*::-webkit-scrollbar': { width: 10, height: 10 },
            '*::-webkit-scrollbar-track': { background: 'transparent' },
            '*::-webkit-scrollbar-thumb': {
              background: 'rgba(100,116,139,0.28)',
              borderRadius: 999,
              border: '2px solid transparent',
              backgroundClip: 'padding-box'
            },
            '*::-webkit-scrollbar-thumb:hover': { background: 'rgba(100,116,139,0.5)', backgroundClip: 'padding-box' }
          }
        },
        // AppLayout's content column already has the page gutters; a Container's
        // own added a second pair, which a phone paid for in width.
        MuiContainer: {
          defaultProps: { disableGutters: true }
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: ({ theme }) => ({
              borderRadius: 10,
              [HANDHELD]: { minHeight: TOUCH_TARGET },
              variants: [
                {
                  // A little light from above and a glow in its own colour: a
                  // flat fill read as a sticker on the frosted chrome.
                  props: { variant: 'contained', color: 'primary' },
                  style: {
                    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0))',
                    boxShadow: `0 1px 0 rgba(255,255,255,0.18) inset, 0 8px 20px -10px ${theme.alpha(theme.vars.palette.primary.main, 0.7)}`,
                    '&:hover': {
                      boxShadow: `0 1px 0 rgba(255,255,255,0.18) inset, 0 10px 24px -10px ${theme.alpha(theme.vars.palette.primary.main, 0.85)}`
                    },
                    '&.Mui-disabled': { backgroundImage: 'none', boxShadow: 'none' }
                  }
                }
              ]
            }),
            sizeSmall: { [HANDHELD]: { minHeight: 36 } }
          }
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              [HANDHELD]: {
                minWidth: TOUCH_TARGET,
                minHeight: TOUCH_TARGET,
                // Inside a text field the field is the target, and 44px would
                // stretch a small one taller than its neighbours.
                '.MuiInputAdornment-root &': { minWidth: 0, minHeight: 0 }
              }
            },
            sizeSmall: { [HANDHELD]: { minWidth: 36, minHeight: 36 } }
          }
        },
        MuiMenuItem: {
          styleOverrides: { root: { [HANDHELD]: { minHeight: TOUCH_TARGET } } }
        },
        MuiListItemButton: {
          styleOverrides: { root: { [HANDHELD]: { minHeight: TOUCH_TARGET } } }
        },
        MuiFab: {
          styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } }
        },
        MuiPaper: {
          styleOverrides: {
            // MUI lightens dark paper by elevation with a white overlay, which
            // turns a menu grey against its own panel. The surfaces are chosen.
            root: { backgroundImage: 'none' },
            rounded: { borderRadius: 12 },
            outlined: { borderColor: surface.divider }
          }
        },
        MuiCard: {
          defaultProps: { variant: 'outlined' },
          styleOverrides: {
            root: { borderRadius: 16, boxShadow: raisedShadow }
          }
        },
        MuiPopover: {
          styleOverrides: { paper: { ...glass, borderRadius: 12 } }
        },
        MuiMenu: {
          styleOverrides: { paper: { borderRadius: 12 } }
        },
        MuiAutocomplete: {
          styleOverrides: { paper: { ...glass, borderRadius: 12 } }
        },
        MuiDialog: {
          styleOverrides: {
            // Solid: a form over a blur is harder to read than it is pretty.
            paper: {
              borderRadius: 16,
              border: `1px solid ${surface.divider}`,
              boxShadow: '0 30px 80px -30px rgba(0,0,0,0.45)',
              // Near full screen on a phone: a desktop's margins squeeze a form
              // into the middle for nothing.
              [HANDHELD]: {
                margin: 12,
                width: 'calc(100% - 24px)',
                maxWidth: 'calc(100% - 24px)',
                maxHeight: 'calc(100% - 24px)'
              }
            }
          }
        },
        MuiBackdrop: {
          styleOverrides: {
            root: {
              variants: [
                {
                  props: { invisible: false },
                  style: { backgroundColor: 'rgba(8,12,20,0.45)', backdropFilter: 'blur(3px)' }
                }
              ]
            }
          }
        },
        MuiOutlinedInput: {
          styleOverrides: { root: { borderRadius: 10, backgroundColor: surface.paper } }
        },
        MuiAlert: {
          styleOverrides: { root: { borderRadius: 10 } }
        },
        MuiChip: {
          styleOverrides: { root: { fontWeight: 500 } }
        },
        // A tab strip wider than the phone it is on is the commonest cause of a
        // page that slides sideways. A page that wants fixed tabs says so.
        MuiTabs: {
          defaultProps: { variant: 'scrollable', scrollButtons: 'auto', allowScrollButtonsMobile: true }
        },
        MuiTab: {
          styleOverrides: { root: { textTransform: 'none', fontWeight: 600, [HANDHELD]: { minWidth: 'auto', paddingInline: 12 } } }
        },
        MuiTableCell: {
          styleOverrides: {
            root: { borderColor: surface.divider },
            head: {
              backgroundColor: surface.sunken,
              color: ink.body,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }
          }
        },
        MuiTooltip: {
          styleOverrides: { tooltip: { fontSize: '0.75rem', borderRadius: 8, padding: '6px 10px' } }
        },
        MuiLinearProgress: {
          styleOverrides: { root: { borderRadius: 999 }, bar: { borderRadius: 999 } }
        }
      }
    },
    overrides
  );
}

/** Built once at module scope: a theme rebuilt per render remounts every style. */
export const visinTheme = createVisinTheme();
