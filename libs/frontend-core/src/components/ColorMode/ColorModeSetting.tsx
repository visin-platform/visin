import { useEffect, useId } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography, useColorScheme, useTheme, type Palette } from '@mui/material';
import { BrightnessAutoOutlined, DarkModeOutlined, LightModeOutlined } from '@mui/icons-material';
import { VISIN_COLORS } from '../../theme';

export type ColorMode = 'system' | 'light' | 'dark';

export const COLOR_MODE_OPTIONS: { value: ColorMode; label: string; Icon: typeof LightModeOutlined }[] = [
  { value: 'system', label: 'Auto', Icon: BrightnessAutoOutlined },
  { value: 'light', label: 'Light', Icon: LightModeOutlined },
  { value: 'dark', label: 'Dark', Icon: DarkModeOutlined }
];

export interface ColorModeSettingProps {
  /** Shown above the buttons. Pass `null` where the surrounding row already says what it is. */
  label?: string | null;
  /** Tighter, for a menu rather than a settings page. */
  dense?: boolean;
}

/**
 * Auto, light or dark, for the whole of Visin.
 *
 * The choice lives in the shell's theme provider, which every remote is
 * federated into, so changing it here changes it everywhere at once. It is per
 * device on purpose: the same person may want dark on a laptop at night and
 * light on a desk monitor.
 */
export function ColorModeSetting({ label = 'Appearance', dense = false }: ColorModeSettingProps) {
  const { mode, setMode } = useColorScheme();
  const labelId = useId();

  return (
    <Box>
      {label && (
        <Typography variant="subtitle2" component="p" id={labelId} sx={{ mb: 1 }}>
          {label}
        </Typography>
      )}
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={mode ?? 'system'}
        onChange={(_, next: ColorMode | null) => next && setMode(next)}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : 'Appearance'}
        sx={{ '& .MuiToggleButton-root': { gap: 0.75, textTransform: 'none', py: dense ? 0.5 : 0.75 } }}
      >
        {COLOR_MODE_OPTIONS.map(({ value, label: text, Icon }) => (
          <ToggleButton key={value} value={value}>
            <Icon fontSize="small" />
            {text}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}

/**
 * Keeps the browser's own bar (`<meta name="theme-color">`) on the scheme that
 * is showing, which index.html can only guess at before the app loads.
 */
export function useThemeColorMeta() {
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    if (!colorScheme) return;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', colorScheme === 'dark' ? VISIN_COLORS.themeColorDark : VISIN_COLORS.themeColor);
  }, [colorScheme]);
}

/**
 * The palette of the scheme that is showing, as real colour values.
 *
 * `theme.palette` is not it: with CSS variables the theme object is built once
 * and holds the light palette in both schemes. That is fine in `sx`, which
 * should say `'text.secondary'` anyway, but anything that needs the colour
 * itself — `alpha()`, an SVG attribute, a chart series — reads the light value
 * in dark. Use this there.
 */
export function useActivePalette(): Palette {
  const theme = useTheme();
  const { colorScheme } = useColorScheme();
  return (colorScheme && theme.colorSchemes?.[colorScheme]?.palette) || theme.palette;
}
