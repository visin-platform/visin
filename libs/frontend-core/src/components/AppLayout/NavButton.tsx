import { ReactNode } from 'react';
import { Box, ButtonBase, useTheme } from '@mui/material';
import { chrome, livePalette, surface } from '../../theme';
import { AppLayoutNavItem } from './types';
import { linkProps } from './navLinks';

interface NavButtonProps {
  label: string;
  icon: ReactNode;
  /** Drawn highlighted: the group being shown. */
  active: boolean;
  /** The group being shown, announced as such. */
  current: boolean;
  mobile: boolean;
  /** Where the entry leads. */
  target: AppLayoutNavItem;
}

export function NavButton({ label, icon, active, current, mobile, target }: NavButtonProps) {
  const theme = useTheme();

  const palette = livePalette(theme);

  // The rail and the phone's tab bar are the same frosted chrome, in either scheme.
  const tone = {
    idle: chrome.inkMuted,
    active: chrome.ink,
    activeIcon: palette.primary.main,
    pill: theme.alpha(palette.primary.main, 0.14),
    pillHover: theme.alpha(palette.primary.main, 0.2),
    idleHover: surface.hover,
    focus: palette.primary.main
  };

  const sx = {
    flex: mobile ? 1 : 'none',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0.5,
    py: 0.5,
    borderRadius: 3,
    color: active ? tone.active : tone.idle,
    WebkitTapHighlightColor: 'transparent',
    '& .nav-pill': {
      width: 56,
      height: 32,
      borderRadius: 999,
      display: 'grid',
      placeItems: 'center',
      color: active ? tone.activeIcon : 'inherit',
      bgcolor: active ? tone.pill : 'transparent',
      transition: 'background-color .2s ease, color .2s ease, transform .15s ease'
    },
    '&:hover': { color: tone.active },
    '&:hover .nav-pill': { bgcolor: active ? tone.pillHover : tone.idleHover },
    '&:active .nav-pill': { transform: 'scale(0.94)' },
    '&.Mui-focusVisible .nav-pill': { outline: `2px solid ${tone.focus}`, outlineOffset: 1 }
  } as const;

  const body = (
    <>
      {/* Hidden from the accessible name, which the label alone gives: an avatar's initial would prefix it. */}
      <Box className="nav-pill" aria-hidden>
        {icon}
      </Box>
      <Box
        component="span"
        sx={{
          maxWidth: '100%',
          fontSize: mobile ? 11 : 11.5,
          fontWeight: active ? 700 : 500,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {label}
      </Box>
    </>
  );

  return (
    <ButtonBase {...linkProps(target)} aria-current={current ? ('true' as const) : undefined} disableRipple sx={sx}>
      {body}
    </ButtonBase>
  );
}
