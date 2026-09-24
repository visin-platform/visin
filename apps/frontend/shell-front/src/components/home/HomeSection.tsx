import { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, ButtonBase, Link, Skeleton, Typography } from '@mui/material';
import { tint } from '@visin/frontend-core';
import { ChevronRight } from '@mui/icons-material';
import { panelSx } from './panel';

interface HomeSectionProps {
  id: string;
  title: string;
  /** Where the full list lives; left out where there is no such page. */
  seeAll?: { to: string; label: string };
  children: ReactNode;
}

/**
 * A captioned group of rows, the way a phone's settings screens group theirs:
 * a small caption with "See all" beside it, then the rows in one panel.
 */
export function HomeSection({ id, title, seeAll, children }: HomeSectionProps) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, px: 0.5, mb: 1 }}>
        <Typography
          id={id}
          component="h2"
          sx={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'text.secondary'
          }}
        >
          {title}
        </Typography>
        {seeAll && (
          <Link
            component={RouterLink}
            to={seeAll.to}
            aria-label={seeAll.label}
            underline="none"
            sx={{ fontSize: 14, fontWeight: 600 }}
          >
            See all
          </Link>
        )}
      </Box>
      <Box sx={panelSx}>{children}</Box>
    </Box>
  );
}

// Up to two lines, then an ellipsis. One line cut a phone row's detail off
// before its most useful part — how long ago — and a finding's title mid-clause.
const twoLines = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  overflowWrap: 'anywhere'
} as const;

interface ListRowProps {
  to: string;
  leading: ReactNode;
  title: string;
  secondary: string;
  /** Drawn under the secondary line, e.g. a progress meter. */
  children?: ReactNode;
}

/** A whole-row tap target: icon, two lines, chevron. */
export function ListRow({ to, leading, title, secondary, children }: ListRowProps) {
  return (
    <ButtonBase
      component={RouterLink}
      to={to}
      className="home-row"
      sx={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 1.5,
        px: 2,
        py: 1.5,
        minHeight: 64,
        textAlign: 'left',
        color: 'text.primary',
        WebkitTapHighlightColor: 'transparent',
        transition: 'background-color .15s ease',
        '&:hover': { bgcolor: 'action.hover' },
        '&:active': { bgcolor: 'action.selected' },
        // A hairline between rows, inset past the icon the way a phone list draws it.
        '.home-row + &::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 68,
          right: 0,
          borderTop: '1px solid',
          borderColor: 'divider'
        }
      }}
    >
      {leading}
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="span" sx={{ ...twoLines, fontSize: '0.975rem', fontWeight: 600, lineHeight: 1.4 }}>
          {title}
        </Typography>
        <Typography component="span" variant="body2" sx={{ ...twoLines, color: 'text.secondary' }}>
          {secondary}
        </Typography>
        {children}
      </Box>
      <ChevronRight sx={{ color: 'text.disabled', flexShrink: 0 }} />
    </ButtonBase>
  );
}

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
        // `tint`: the colour may be a theme variable, which MUI's `alpha` cannot read.
        bgcolor: tint(color, 0.12)
      }}
    >
      {children}
    </Box>
  );
}

interface SectionBodyProps<T> {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  items: T[] | undefined;
  empty: string;
  error: string;
  children: (item: T) => ReactNode;
}

/**
 * Rows, or what stands in for them. Skeletons show on the first load only: a
 * refetch keeps the rows already on screen rather than flashing placeholders.
 */
export function SectionBody<T>({ query, items, empty, error, children }: SectionBodyProps<T>) {
  if (query.isPending) {
    return (
      <Box role="status" aria-label="Loading">
        {[0, 1, 2].map((row) => (
          <Box key={row} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, minHeight: 64 }}>
            <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '12px' }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="60%" />
              <Skeleton width="35%" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (query.isError || !items || items.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 2.25 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {query.isError ? error : empty}
        </Typography>
        {query.isError && (
          <Button size="small" onClick={() => void query.refetch()}>
            Retry
          </Button>
        )}
      </Box>
    );
  }

  return <>{items.map(children)}</>;
}
