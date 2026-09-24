import type { ReactNode } from 'react';
import { CssBaseline, ThemeProvider, type Theme } from '@mui/material';
import { COLOR_MODE_STORAGE_KEY, COLOR_SCHEME_STORAGE_KEY, visinTheme } from '../../theme';
import { useThemeColorMeta } from './ColorModeSetting';

function ThemeColorMeta() {
  useThemeColorMeta();
  return null;
}

export interface VisinThemeProviderProps {
  children: ReactNode;
  /** Defaults to the shared Visin theme. */
  theme?: Theme;
}

/**
 * The theme, the light/dark state and the page baseline, for a front's root.
 *
 * Inside the shell a remote renders one of these under the shell's own: MUI
 * hands the nested provider the outer light/dark state rather than starting a
 * second, so the storage keys only matter for whichever is outermost.
 */
export function VisinThemeProvider({ children, theme = visinTheme }: VisinThemeProviderProps) {
  return (
    <ThemeProvider
      theme={theme}
      modeStorageKey={COLOR_MODE_STORAGE_KEY}
      colorSchemeStorageKey={COLOR_SCHEME_STORAGE_KEY}
      disableTransitionOnChange
      noSsr
    >
      <CssBaseline enableColorScheme />
      <ThemeColorMeta />
      {children}
    </ThemeProvider>
  );
}
