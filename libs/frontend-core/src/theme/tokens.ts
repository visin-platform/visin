/**
 * The colours Visin draws with, per colour scheme, in one place.
 *
 * Pages never read the raw values: they use `ink`, `surface`, `glass` and
 * `chrome`, which point at CSS variables the theme writes for both schemes, so
 * a page that says `color: ink.muted` follows the switch without knowing there
 * is one. The raw values are here for the contrast tests and for the few places
 * outside a React tree (`theme-color`, the manifest, the offline page).
 *
 * The dark scheme is slate with a little blue in it rather than neutral grey:
 * it keeps the brand's cast, and pure grey behind charts reads as dead.
 */

/** Primary, per scheme: what can be acted on. Walked lighter for dark, where the light blue fails AA. */
export const brand = {
  light: '#2563eb',
  dark: '#60a5fa'
} as const;

export const schemes = {
  light: {
    /** Text, darkest to lightest. Slate rather than grey, to sit under the blue. */
    ink: {
      strong: '#0f172a',
      body: '#475569',
      muted: '#5b6779',
      /** Decorative only — under 3:1. Never put words a reader needs in this. */
      faint: '#94a3b8'
    },
    surface: {
      /** A faint blue glow at the top of the page, over `default`. */
      glow: 'rgba(37,99,235,0.10)',
      default: '#f6f7fb',
      paper: '#ffffff',
      /** Table heads, inset panels: one step back from `paper`. */
      sunken: '#f8fafc',
      divider: '#e2e8f0',
      /** The edge of the frosted chrome: an opaque divider draws a hard rule across the blur. */
      chromeEdge: 'rgba(15,23,42,0.08)',
      /** Hover tint on neutral controls. */
      hover: 'rgba(15,23,42,0.05)',
      /** The veil over an image that text has to stay readable on. */
      scrim: 'rgba(255,255,255,0.72)'
    },
    // Opaque enough that a bright button under a menu reads as colour, not as
    // a second button: 0.72 let one show through as a smear.
    glass: {
      background: 'rgba(255,255,255,0.88)',
      border: 'rgba(15,23,42,0.07)',
      shadow: 'rgba(15,23,42,0.30)'
    },
    chrome: {
      background: 'rgba(255,255,255,0.72)',
      ink: '#0f172a',
      inkMuted: '#5b6779'
    },
    /** The main action's gradient, blue into indigo; white text clears AA on every stop. */
    accent: {
      start: '#2563eb',
      end: '#4f46e5',
      startHover: '#1d4ed8',
      endHover: '#4338ca'
    },
    /** The browser's own bar, `<meta name="theme-color">`. */
    themeColor: '#f6f7fb'
  },
  dark: {
    ink: {
      strong: '#e6eaf2',
      body: '#b3bccb',
      muted: '#8f9aac',
      faint: '#5b6474'
    },
    surface: {
      glow: 'rgba(96,165,250,0.12)',
      default: '#0b0f17',
      paper: '#121826',
      // One step *forward* in dark: a darker head on a dark table disappears.
      sunken: '#182030',
      divider: '#232b3a',
      chromeEdge: 'rgba(148,163,184,0.12)',
      hover: 'rgba(255,255,255,0.06)',
      scrim: 'rgba(11,15,23,0.72)'
    },
    glass: {
      background: 'rgba(18,24,38,0.86)',
      border: 'rgba(255,255,255,0.07)',
      shadow: 'rgba(0,0,0,0.65)'
    },
    chrome: {
      background: 'rgba(13,18,28,0.72)',
      ink: '#e6eaf2',
      inkMuted: '#8f9aac'
    },
    // Lighter stops for dark, under dark text; hover lightens rather than darkens.
    accent: {
      start: '#60a5fa',
      end: '#818cf8',
      startHover: '#93c5fd',
      endHover: '#a5b4fc'
    },
    themeColor: '#0b0f17'
  }
} as const;

export type ColorSchemeName = keyof typeof schemes;

/** A token's CSS variable, e.g. `--vi-surface-chrome-edge`. */
const cssVar = (group: string, key: string) =>
  `--vi-${group}-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

const refs = <T extends Record<string, string>>(group: string, values: T) =>
  Object.fromEntries(Object.keys(values).map((key) => [key, `var(${cssVar(group, key)})`])) as {
    readonly [K in keyof T]: string;
  };

const flatten = (group: string, values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => [cssVar(group, key), value]);

/** One scheme as CSS custom properties. The theme writes these; nothing else should. */
export function schemeCssVars(name: ColorSchemeName): Record<string, string> {
  const scheme = schemes[name];
  return Object.fromEntries([
    ...flatten('ink', scheme.ink),
    ...flatten('surface', scheme.surface),
    ...flatten('glass', scheme.glass),
    ...flatten('chrome', scheme.chrome),
    ...flatten('accent', scheme.accent)
  ]);
}

/** Text, darkest to lightest. Follows light and dark. */
export const ink = refs('ink', schemes.light.ink);

/** Page and panel backgrounds. Follows light and dark. */
export const surface = refs('surface', schemes.light.surface);

const chromeVars = refs('chrome', schemes.light.chrome);
const accentVars = refs('accent', schemes.light.accent);

/** The page behind everything: a glow at the top, fading into `default`. */
export const pageBackground = {
  backgroundColor: surface.default,
  backgroundImage: `radial-gradient(1200px 520px at 50% -160px, ${surface.glow}, transparent 70%)`,
  backgroundRepeat: 'no-repeat'
} as const;

/**
 * A frosted surface that floats over the page: menus, popovers, dialogs, the
 * phone's bottom sheet, cards on the home page. Translucent on purpose, so what
 * is under it shows through as colour rather than being cut out.
 *
 * Not for tables, lists and charts. Blur behind numbers costs legibility and
 * scrolling; those stay on solid `Panel`s.
 */
export const glass = {
  background: 'var(--vi-glass-background)',
  backdropFilter: 'blur(14px) saturate(160%)',
  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  border: '1px solid var(--vi-glass-border)',
  boxShadow: '0 18px 40px -24px var(--vi-glass-shadow)'
} as const;

/**
 * The resting shadow of a solid surface (a `Panel`, a card): enough to lift it
 * off the page, soft enough that a stack of them does not read as clutter.
 */
export const raisedShadow = '0 12px 32px -28px rgba(15,23,42,0.45)';

/** A surface that rises toward the pointer. `accent` tints the edge and the lifted shadow. */
export const liftOnHover = (accent = 'var(--mui-palette-primary-main)') =>
  ({
    transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
      boxShadow: `0 22px 44px -26px color-mix(in srgb, ${accent} 80%, transparent)`
    },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } }
  }) as const;

/** A glass card that responds to being pointed at. `accent` tints the lifted shadow. */
export const glassInteractive = (accent?: string) => ({ ...glass, ...liftOnHover(accent) }) as const;

/**
 * The one action a page is for, where a plain filled button undersells it: a
 * blue-to-indigo gradient with a glow. At most one per page.
 */
export const mainAction = {
  backgroundImage: `linear-gradient(135deg, ${accentVars.start} 0%, ${accentVars.end} 100%)`,
  color: 'var(--mui-palette-primary-contrastText)',
  boxShadow: '0 10px 28px -12px color-mix(in srgb, var(--mui-palette-primary-main) 85%, transparent)',
  '&:hover': {
    backgroundImage: `linear-gradient(135deg, ${accentVars.startHover} 0%, ${accentVars.endHover} 100%)`,
    boxShadow: '0 12px 32px -12px color-mix(in srgb, var(--mui-palette-primary-main) 95%, transparent)'
  }
} as const;

/**
 * The frosted chrome around the content: the navigation rail, the app bar and
 * the phone's tab bar. One tint and one blur for all three, because they meet
 * at a corner, and two slightly different tints show as a step there.
 */
export const chrome = {
  background: chromeVars.background,
  ink: chromeVars.ink,
  inkMuted: chromeVars.inkMuted,
  edge: surface.chromeEdge,
  surface: {
    background: chromeVars.background,
    backdropFilter: 'blur(16px) saturate(165%)',
    WebkitBackdropFilter: 'blur(16px) saturate(165%)'
  }
} as const;

/**
 * Controls laid over a photo or a frame: a viewer's buttons, a caption chip.
 * The same in both schemes, because the picture under them is.
 */
export const onImage = {
  /** Behind a frame being judged: dark and neutral, so the picture's own colours read true. */
  backdrop: '#0b0f19',
  ink: '#ffffff',
  scrim: 'rgba(0,0,0,0.5)',
  scrimStrong: 'rgba(0,0,0,0.7)',
  chip: 'rgba(255,255,255,0.2)'
} as const;

/** `color` at `opacity` (0–1). Unlike MUI's `alpha()`, works on a CSS variable as well as a hex. */
export const tint = (color: string, opacity: number) =>
  `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
