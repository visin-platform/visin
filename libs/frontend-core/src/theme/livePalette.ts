import type { Theme } from '@mui/material/styles';

/**
 * The palette as values that follow light and dark: CSS variables under the
 * Visin theme, plain colours under a theme without them (a test's default).
 *
 * `theme.palette` holds the light values in both schemes. Anything built from
 * this must mix colours in CSS — `tint`, `theme.alpha` — not with MUI's
 * `alpha()`, which cannot parse a variable.
 */
export const livePalette = (theme: Theme) => (theme.vars ?? theme).palette;
