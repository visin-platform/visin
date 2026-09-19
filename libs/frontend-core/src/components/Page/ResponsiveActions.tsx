import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, ListItemIcon, Menu, MenuItem } from '@mui/material';
import { MoreVert } from '@mui/icons-material';
import { useCompactLayout } from './layout';

export interface ResponsiveAction {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  /** A route in this app. */
  to?: string;
  /** A page or file elsewhere. */
  href?: string;
  /** Filled: the one thing this page is for. At most one per bar. */
  primary?: boolean;
  /** A destructive action, drawn in the error colour. */
  danger?: boolean;
  disabled?: boolean;
}

export interface ResponsiveActionsProps {
  actions: ResponsiveAction[];
  /**
   * How many of the leading actions stay buttons on a phone; the rest move into
   * a ⋮ menu. Defaults to 0 — a phone's width belongs to the content.
   */
  keepOnPhone?: number;
  /**
   * How many stay buttons on desktop; the rest go behind ⋮ there too. Defaults
   * to all — set it where a page has chores (exports, archive) that would
   * otherwise crowd out what the page is for.
   */
  keepOnDesktop?: number;
  /** Names the ⋮ button, e.g. "More actions for VLM". */
  menuLabel?: string;
}

const linkProps = (action: ResponsiveAction) =>
  action.to !== undefined
    ? { component: RouterLink, to: action.to }
    : action.href !== undefined
      ? { component: 'a' as const, href: action.href }
      : {};

/**
 * A page's actions: a row of buttons on desktop, and on a phone the leading
 * few as buttons with the rest behind a ⋮ menu, the way a native app keeps its
 * toolbar to what fits.
 */
export function ResponsiveActions({ actions, keepOnPhone = 0, keepOnDesktop, menuLabel = 'More actions' }: ResponsiveActionsProps) {
  const compact = useCompactLayout();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const kept = compact ? keepOnPhone : (keepOnDesktop ?? actions.length);
  const shown = actions.slice(0, kept);
  const overflow = actions.slice(kept);

  if (actions.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      {shown.map((action) => (
        <Button
          key={action.label}
          {...linkProps(action)}
          onClick={action.onClick}
          disabled={action.disabled}
          startIcon={action.icon}
          variant={action.primary ? 'contained' : 'outlined'}
          color={action.danger ? 'error' : action.primary ? 'primary' : 'inherit'}
          sx={action.primary || action.danger ? undefined : { borderColor: 'divider', color: 'text.primary' }}
        >
          {action.label}
        </Button>
      ))}
      {overflow.length > 0 && (
        <>
          <IconButton aria-label={menuLabel} aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)}>
            <MoreVert />
          </IconButton>
          <Menu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { minWidth: 200 } } }}
          >
            {overflow.map((action) => (
              <MenuItem
                key={action.label}
                {...linkProps(action)}
                disabled={action.disabled}
                onClick={() => {
                  setAnchor(null);
                  action.onClick?.();
                }}
                sx={action.danger ? { color: 'error.main' } : undefined}
              >
                {action.icon && <ListItemIcon sx={action.danger ? { color: 'inherit' } : undefined}>{action.icon}</ListItemIcon>}
                {action.label}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Box>
  );
}
