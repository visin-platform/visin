import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Fab, Typography } from '@mui/material';
import { TAB_BAR_HEIGHT, useCompactLayout } from './layout';

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap'
} as const;

export interface PageAction {
  label: string;
  icon?: ReactNode;
  /** A route in this app. */
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface PageHeaderProps {
  /**
   * Left out where the layout already titles the page (label and account pages,
   * whose `AppLayout` header names them): then only the subtitle and actions show.
   */
  title?: string;
  subtitle?: ReactNode;
  /** Secondary controls beside the primary action, e.g. a refresh button. */
  actions?: ReactNode;
  /** The page's main action. A button on desktop; a floating button above the tab bar on a phone. */
  primaryAction?: PageAction;
  /**
   * The app bar already names this page on a phone — a top-level section like
   * Projects or Jobs — so the title is left out there rather than said twice.
   */
  hideTitleOnPhone?: boolean;
}

/**
 * The top of a page: its title, a line saying what it is for, and what can be
 * done here. On a phone the main action moves to a floating button in thumb
 * reach, the way a native app offers "new".
 */
export function PageHeader({ title, subtitle, actions, primaryAction, hideTitleOnPhone = false }: PageHeaderProps) {
  const compact = useCompactLayout();
  const showTitle = title !== undefined && !(compact && hideTitleOnPhone);
  const link = primaryAction?.to !== undefined ? { component: RouterLink, to: primaryAction.to } : {};

  const primary =
    primaryAction &&
    (compact ? (
      <Fab
        variant="extended"
        color="primary"
        {...link}
        onClick={primaryAction.onClick}
        disabled={primaryAction.disabled}
        sx={{
          position: 'fixed',
          right: 16,
          bottom: `calc(${TAB_BAR_HEIGHT}px + 16px + env(safe-area-inset-bottom))`,
          zIndex: (theme) => theme.zIndex.speedDial,
          gap: 1,
          px: 2.5,
          boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)'
        }}
      >
        {primaryAction.icon}
        {primaryAction.label}
      </Fab>
    ) : (
      <Button
        variant="contained"
        {...link}
        onClick={primaryAction.onClick}
        disabled={primaryAction.disabled}
        startIcon={primaryAction.icon}
        sx={{ flexShrink: 0, height: 40, px: 2.25 }}
      >
        {primaryAction.label}
      </Button>
    ));

  const controls = (actions || (primary && !compact)) && (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
      {actions}
      {!compact && primary}
    </Box>
  );

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: showTitle ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        // A narrow screen wraps a wide control (a select) under the text rather
        // than squeezing the text into a strip beside it; an icon still fits.
        flexWrap: 'wrap',
        gap: 2,
        // Nothing visible (a phone, no subtitle or controls): no gap either.
        mb: !showTitle && !subtitle && !controls ? 0 : { xs: 2, md: 3 }
      }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
        {/* Kept for screen readers where the app bar shows it instead. */}
        {title !== undefined && (
          <Typography
            variant="h4"
            component="h1"
            sx={
              showTitle
                ? { fontSize: { xs: '1.5rem', md: '1.75rem' }, lineHeight: 1.25, mb: subtitle ? 0.5 : 0 }
                : visuallyHidden
            }
          >
            {title}
          </Typography>
        )}
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: { md: '0.95rem' } }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {controls}
      {compact && primary}
    </Box>
  );
}
