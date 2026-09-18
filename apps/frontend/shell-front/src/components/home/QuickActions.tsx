import { Link as RouterLink } from 'react-router-dom';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { AddTask, ModelTraining, PhotoLibrary } from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';

interface Shortcut {
  label: string;
  to: string;
  Icon: SvgIconComponent;
  color: string;
  app: 'vision' | 'label';
}

const SHORTCUTS: Shortcut[] = [
  { label: 'Trainings', to: '/trainings', Icon: ModelTraining, color: '#2563eb', app: 'vision' },
  { label: 'Datasets', to: '/datasets', Icon: PhotoLibrary, color: '#0d9488', app: 'vision' },
  { label: 'New job', to: '/jobs/new', Icon: AddTask, color: '#ea580c', app: 'label' }
];

interface QuickActionsProps {
  /** Which apps this deployment can load; a shortcut into a missing one is left out. */
  apps: { vision: boolean; label: boolean };
}

/**
 * One tap to where people most often go. On a phone, coloured squares with the
 * label under each — the layout a phone's own home screen taught everyone;
 * from md up, the same entries as cards with the label beside the icon, where a
 * bare icon would be lost in the width.
 */
export function QuickActions({ apps }: QuickActionsProps) {
  const shortcuts = SHORTCUTS.filter((shortcut) => apps[shortcut.app]);

  if (shortcuts.length === 0) {
    return null;
  }

  return (
    <Box
      component="nav"
      aria-label="Shortcuts"
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: { xs: 1, md: 2 } }}
    >
      {shortcuts.map(({ label, to, Icon, color }) => (
        <ButtonBase
          key={to}
          component={RouterLink}
          to={to}
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: { xs: 0.75, md: 1.5 },
            minWidth: 0,
            py: { xs: 0.5, md: 1.5 },
            px: { xs: 0, md: 2 },
            borderRadius: '16px',
            bgcolor: { xs: 'transparent', md: 'background.paper' },
            border: '1px solid',
            borderColor: { xs: 'transparent', md: 'divider' },
            color: 'text.primary',
            WebkitTapHighlightColor: 'transparent',
            '&:hover .shortcut-icon': { filter: 'brightness(1.08)' },
            '&:active .shortcut-icon': { transform: 'scale(0.92)' },
            '&.Mui-focusVisible .shortcut-icon': { outline: `2px solid ${color}`, outlineOffset: 2 }
          }}
        >
          <Box
            className="shortcut-icon"
            aria-hidden
            sx={{
              width: { xs: 60, md: 40 },
              height: { xs: 60, md: 40 },
              borderRadius: { xs: '18px', md: '12px' },
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              color: '#fff',
              background: `linear-gradient(145deg, ${color} 0%, ${alpha(color, 0.8)} 100%)`,
              boxShadow: `0 10px 20px -12px ${color}`,
              transition: 'transform .15s ease, filter .15s ease'
            }}
          >
            <Icon sx={{ fontSize: { xs: 28, md: 22 } }} />
          </Box>
          <Typography
            component="span"
            noWrap
            sx={{ maxWidth: '100%', fontSize: { xs: 12.5, md: 15 }, fontWeight: 600 }}
          >
            {label}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  );
}
