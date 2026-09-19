import { useMediaQuery, useTheme } from '@mui/material';

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
