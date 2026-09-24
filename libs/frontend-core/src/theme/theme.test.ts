import { describe, it, expect } from 'vitest';
import { createTheme } from '@mui/material/styles';
import {
  chrome,
  createVisinTheme,
  glassInteractive,
  ink,
  livePalette,
  schemeCssVars,
  schemes,
  surface,
  tint,
  VISIN_COLORS,
  type ColorSchemeName
} from '.';

// WCAG 2 relative luminance and contrast ratio, for opaque hex colours.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const SCHEMES: ColorSchemeName[] = ['light', 'dark'];

describe('createVisinTheme', () => {
  it('is built on the brand colour, the Inter typeface and sentence-case buttons', () => {
    const theme = createVisinTheme();

    expect(theme.palette.primary.main).toBe(VISIN_COLORS.brand);
    expect(theme.typography.fontFamily).toMatch(/^"Inter"/);
    expect(theme.typography.button.textTransform).toBe('none');
    // MUI's unit: the apps' `borderRadius: 2` must stay 8px, not become a pill.
    expect(theme.shape.borderRadius).toBe(4);
  });

  it('carries a light and a dark scheme, switched by an attribute on <html>', () => {
    const theme = createVisinTheme();

    expect(theme.colorSchemes.light?.palette.mode).toBe('light');
    expect(theme.colorSchemes.dark?.palette.mode).toBe('dark');
    expect(theme.colorSchemes.dark?.palette.background.default).toBe(schemes.dark.surface.default);
    expect(theme.vars.palette.primary.main).toMatch(/^var\(--mui-palette-primary-main/);
  });

  it('takes overrides', () => {
    const theme = createVisinTheme({ colorSchemes: { light: { palette: { primary: { main: '#000000' } } } } });

    expect(theme.colorSchemes.light?.palette.primary.main).toBe('#000000');
  });
});

describe('tokens', () => {
  it('point at variables the theme writes for both schemes', () => {
    expect(ink.muted).toBe('var(--vi-ink-muted)');
    expect(surface.chromeEdge).toBe('var(--vi-surface-chrome-edge)');
    expect(chrome.inkMuted).toBe('var(--vi-chrome-ink-muted)');

    for (const name of SCHEMES) {
      const vars = schemeCssVars(name);
      expect(vars['--vi-ink-muted']).toBe(schemes[name].ink.muted);
      expect(vars['--vi-surface-chrome-edge']).toBe(schemes[name].surface.chromeEdge);
      expect(vars['--vi-glass-background']).toBe(schemes[name].glass.background);
      expect(vars['--vi-chrome-ink']).toBe(schemes[name].chrome.ink);
    }
  });

  it('mix colours in CSS, so a theme variable works as well as a hex', () => {
    expect(tint('var(--x)', 0.12)).toBe('color-mix(in srgb, var(--x) 12%, transparent)');
    expect(glassInteractive('#15803d')['&:hover'].boxShadow).toContain('#15803d');
  });
});

describe('livePalette', () => {
  it('is the variables under the Visin theme and the plain values under one without them', () => {
    expect(livePalette(createVisinTheme()).primary.main).toMatch(/^var\(--mui-palette-primary-main/);
    expect(livePalette(createTheme()).primary.main).toBe('#1976d2');
  });
});

describe.each(SCHEMES)('%s scheme contrast', (name) => {
  const theme = createVisinTheme();
  const palette = theme.colorSchemes[name]!.palette;
  const { ink: inks, surface: surfaces } = schemes[name];
  const backgrounds = { default: surfaces.default, paper: surfaces.paper, sunken: surfaces.sunken };

  // `faint` is decorative, and says so where it is defined.
  it.each(['strong', 'body', 'muted'] as const)('%s text passes AA on every surface', (key) => {
    for (const background of Object.values(backgrounds)) {
      expect(contrast(inks[key], background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['primary', 'success', 'warning', 'error', 'info'] as const)(
    '%s passes AA as text on every surface',
    (key) => {
      for (const background of Object.values(backgrounds)) {
        expect(contrast(palette[key].main, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it('a filled primary button passes AA', () => {
    expect(contrast(palette.primary.contrastText, palette.primary.main)).toBeGreaterThanOrEqual(4.5);
  });

  it('the main action\'s text passes AA on every stop of its gradient', () => {
    for (const stop of Object.values(schemes[name].accent)) {
      expect(contrast(palette.primary.contrastText, stop)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('chrome text passes AA on the page it floats over', () => {
    expect(contrast(schemes[name].chrome.ink, surfaces.default)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(schemes[name].chrome.inkMuted, surfaces.default)).toBeGreaterThanOrEqual(4.5);
  });
});
