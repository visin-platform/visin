import type { Theme } from '@mui/material/styles';
import { livePalette, tint } from '@visin/frontend-core';

export const COLOR_SETS = [
  { id: 'classic', name: 'Visin', palette: 'primary' },
  { id: 'ocean', name: 'Ocean', palette: 'info' },
  { id: 'forest', name: 'Forest', palette: 'success' },
  { id: 'sunset', name: 'Sunset', palette: 'warning' },
  { id: 'graphite', name: 'Graphite', palette: 'secondary' },
  { id: 'rose', name: 'Rose', palette: 'error' }
] as const;
export interface ChatAppearance {
  color: (typeof COLOR_SETS)[number]['id'];
}
export const DEFAULT_APPEARANCE: ChatAppearance = { color: 'classic' };
export function parseAppearance(raw: string | null): ChatAppearance {
  try {
    const value = JSON.parse(raw ?? 'null');
    return {
      color: COLOR_SETS.some((set) => set.id === value?.color) ? value.color : DEFAULT_APPEARANCE.color
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}
export function appearanceSx(theme: Theme, appearance: ChatAppearance) {
  const palette = livePalette(theme);
  const color = palette[COLOR_SETS.find((set) => set.id === appearance.color)!.palette];
  return {
    '--chat-accent': color.main,
    '--chat-accent-ink': color.contrastText,
    '--chat-tint': tint(color.main, 0.12),
    '--chat-message-bg': palette.background.paper,
    '--chat-chrome-bg': tint(palette.background.paper, 0.82),
    '--chat-blur': 'blur(18px) saturate(140%)',
    '--chat-message-gap': '10px',
    '--chat-bubble-y': '6px',
    '--chat-message-shadow': tint(palette.text.primary, 0.06),
    backgroundColor: palette.background.default,
    backgroundImage: `radial-gradient(ellipse at 95% 0%, ${tint(color.main, 0.14)}, transparent 60%), radial-gradient(ellipse at 0% 100%, ${tint(color.main, 0.07)}, transparent 55%)`,
    '& .MuiButton-contained.MuiButton-colorPrimary:not(.Mui-disabled)': {
      backgroundColor: color.main,
      color: color.contrastText,
      boxShadow: `0 8px 20px -12px ${tint(color.main, 0.55)}`
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: color.main },
    '& .MuiInputLabel-root.Mui-focused': { color: color.main }
  };
}
export const chatChrome = (theme: Theme) => ({
  background: `var(--chat-chrome-bg, ${livePalette(theme).background.paper})`,
  backdropFilter: 'var(--chat-blur, none)',
  WebkitBackdropFilter: 'var(--chat-blur, none)'
});
