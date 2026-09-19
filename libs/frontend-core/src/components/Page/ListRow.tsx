import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronRight } from '@mui/icons-material';

// Up to two lines, then an ellipsis: one line cut a phone row's detail off
// before its most useful part.
const twoLines = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  overflowWrap: 'anywhere'
} as const;

export interface ListRowProps {
  /** A route in this app. */
  to?: string;
  /** A page elsewhere, loaded in full. */
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  secondary?: ReactNode;
  /** Controls at the end of the row (a menu, a chip). Replaces the chevron, and sits outside the tap target. */
  trailing?: ReactNode;
  /** Drawn under the secondary line, e.g. a progress meter. */
  children?: ReactNode;
}

/**
 * One row of a native-style list: icon, two lines, and a chevron — the whole
 * row one tap target. Rows in a `Panel` get hairlines between them, inset past
 * the icon the way a phone draws them.
 */
export function ListRow({ to, href, onClick, leading, title, secondary, trailing, children }: ListRowProps) {
  const navigable = to !== undefined || href !== undefined || onClick !== undefined;
  const target = to !== undefined ? { component: RouterLink, to } : href !== undefined ? { component: 'a' as const, href } : {};

  const body = (
    <>
      {leading}
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="span" sx={{ ...twoLines, fontSize: '0.975rem', fontWeight: 600, lineHeight: 1.4 }}>
          {title}
        </Typography>
        {secondary && (
          <Typography component="span" variant="body2" sx={{ ...twoLines, color: 'text.secondary' }}>
            {secondary}
          </Typography>
        )}
        {children}
      </Box>
      {navigable && !trailing && <ChevronRight sx={{ color: 'text.disabled', flexShrink: 0 }} />}
    </>
  );

  const rowSx = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 1.5,
    px: 2,
    py: 1.5,
    minHeight: 64,
    textAlign: 'left',
    color: 'text.primary'
  } as const;

  return (
    <Box
      className="visin-list-row"
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        pr: trailing ? 1 : 0,
        '.visin-list-row + &::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: leading ? 68 : 16,
          right: 0,
          borderTop: '1px solid',
          borderColor: 'divider'
        }
      }}
    >
      {navigable ? (
        <ButtonBase
          {...target}
          onClick={onClick}
          sx={{
            ...rowSx,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background-color .15s ease',
            '&:hover': { bgcolor: 'action.hover' },
            '&:active': { bgcolor: 'action.selected' }
          }}
        >
          {body}
        </ButtonBase>
      ) : (
        <Box sx={rowSx}>{body}</Box>
      )}
      {trailing && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>{trailing}</Box>}
    </Box>
  );
}

/** The tinted square an icon sits in at the start of a row. */
export function RowIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: 40,
        height: 40,
        borderRadius: '12px',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        color,
        bgcolor: alpha(color, 0.12)
      }}
    >
      {children}
    </Box>
  );
}
