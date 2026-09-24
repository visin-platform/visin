import { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, ButtonBase, Skeleton, Typography } from '@mui/material';
import { glassInteractive } from '@visin/frontend-core';
import { formatCount } from './formatting';
import { panelSx } from './panel';

export interface StatTile {
  label: string;
  to: string;
  icon: ReactNode;
  value: number | undefined;
  loading: boolean;
  failed: boolean;
}

/**
 * The few numbers worth a glance, each opening the page behind it. Two across
 * on a phone, like a home screen's widgets; one row from md up.
 */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <Box
      component="section"
      aria-label="Summary"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${tiles.length}, minmax(0, 1fr))` },
        gap: { xs: 1.5, md: 2 }
      }}
    >
      {tiles.map((tile) => (
        <ButtonBase
          key={tile.label}
          component={RouterLink}
          to={tile.to}
          sx={{
            ...panelSx,
            ...glassInteractive(),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: { xs: 1, md: 1.5 },
            p: { xs: 1.75, md: 2.5 },
            textAlign: 'left',
            color: 'text.primary',
            WebkitTapHighlightColor: 'transparent',
            '&:active': { transform: 'scale(0.97)' }
          }}
        >
          <Box
            component="span"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              maxWidth: '100%',
              color: 'text.secondary',
              '& svg': { fontSize: 18 }
            }}
          >
            {tile.icon}
            <Typography component="span" noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>
              {tile.label}
            </Typography>
          </Box>
          {/* Proportional figures: tabular digits look loose at this size. */}
          <Typography
            component="span"
            sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            {tile.loading ? (
              <Skeleton width={56} />
            ) : tile.failed || tile.value === undefined ? (
              '–'
            ) : (
              formatCount(tile.value)
            )}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  );
}
