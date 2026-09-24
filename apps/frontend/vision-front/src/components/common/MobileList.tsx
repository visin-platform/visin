import React, { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, ButtonBase, Checkbox, Chip, IconButton, ListItemIcon, Menu, MenuItem, Typography, useTheme } from '@mui/material';
import { MoreVert as MoreVertIcon } from '@mui/icons-material';
import { livePalette, tint } from '@visin/frontend-core';

/**
 * The phone form of Vision's list tables (runs, test results, benchmarks,
 * configs, comparisons). A table's columns do not fit a phone: the names —
 * long, and the point of the row — were squeezed into a strip. Here the name
 * gets the full width and wraps, and what the columns held sits under it.
 */

export interface MobileListAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export interface MobileListFigure {
  label: string;
  value: ReactNode;
}

export interface MobileListRowProps {
  title: ReactNode;
  /** Where tapping the row leads. Without it (or `onClick`) the row is not a link. */
  to?: string;
  /** What tapping the row does, where it opens something rather than a page. */
  onClick?: () => void;
  /** Beside the checkbox; omit both for a row that is not selectable. */
  selected?: boolean;
  onToggle?: () => void;
  /** The checkbox's accessible name, e.g. "Select WAYMO CLFTv2…". */
  selectLabel?: string;
  /** One line under the title: a status, dates, counts. */
  meta?: ReactNode;
  /** Numbers worth reading side by side, as a small label/value grid. */
  figures?: MobileListFigure[];
  chips?: string[];
  /** Chips shown before the rest collapse into "+N". */
  maxChips?: number;
  footer?: ReactNode;
  /** Behind a ⋮ button at the end of the row. */
  actions?: MobileListAction[];
  actionsLabel?: string;
}

export const MobileListRow: React.FC<MobileListRowProps> = ({
  title,
  to,
  onClick,
  selected,
  onToggle,
  selectLabel,
  meta,
  figures,
  chips = [],
  maxChips = 3,
  footer,
  actions = [],
  actionsLabel = 'Actions'
}) => {
  const theme = useTheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const selectable = onToggle !== undefined;

  const body = (
    <>
      <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{title}</Typography>
      {meta && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.5, mt: 0.75, color: 'text.secondary', fontSize: '0.875rem' }}>
          {meta}
        </Box>
      )}
      {figures && figures.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 1.5, rowGap: 1, mt: 1 }}>
          {figures.map((figure) => (
            <Box key={figure.label} sx={{ minWidth: 0 }}>
              <Typography variant="caption" component="div" noWrap sx={{ color: 'text.secondary', lineHeight: 1.3 }}>
                {figure.label}
              </Typography>
              <Typography component="div" sx={{ fontWeight: 600, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
                {figure.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {chips.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
          {chips.slice(0, maxChips).map((chip) => (
            <Chip key={chip} label={chip} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem', maxWidth: '100%' }} />
          ))}
          {chips.length > maxChips && <Chip label={`+${chips.length - maxChips}`} size="small" sx={{ height: 22, fontSize: '0.7rem' }} />}
        </Box>
      )}
      {footer && (
        <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mt: 0.75 }}>
          {footer}
        </Typography>
      )}
    </>
  );

  const bodySx = { flex: 1, minWidth: 0, py: 0.75, pl: selectable ? 0 : 1.5, color: 'text.primary', textDecoration: 'none' } as const;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        px: 0.5,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
        bgcolor: selected ? tint(livePalette(theme).primary.main, 0.06) : 'transparent'
      }}
    >
      {selectable && (
        <Checkbox size="small" checked={Boolean(selected)} onChange={onToggle} slotProps={{ input: { 'aria-label': selectLabel } }} sx={{ mt: 0.25 }} />
      )}
      {to ? (
        <Box component={Link} to={to} sx={{ ...bodySx, WebkitTapHighlightColor: 'transparent' }}>
          {body}
        </Box>
      ) : onClick ? (
        <ButtonBase onClick={onClick} sx={{ ...bodySx, display: 'block', textAlign: 'left', font: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
          {body}
        </ButtonBase>
      ) : (
        <Box sx={bodySx}>{body}</Box>
      )}
      {actions.length > 0 && (
        <>
          <IconButton aria-label={actionsLabel} onClick={(event) => setAnchor(event.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {actions.map((action) => (
              <MenuItem
                key={action.label}
                onClick={() => {
                  setAnchor(null);
                  action.onClick();
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
};

export interface MobileListHeaderProps {
  /** A select-all checkbox, where rows are selectable. */
  selectAll?: { checked: boolean; indeterminate: boolean; onChange: () => void; label?: string };
  /** Controls at the end, e.g. a sort control. */
  children?: ReactNode;
}

export const MobileListHeader: React.FC<MobileListHeaderProps> = ({ selectAll, children }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1, minHeight: 52, borderBottom: 1, borderColor: 'divider' }}>
    {selectAll && (
      <Checkbox
        size="small"
        checked={selectAll.checked}
        indeterminate={selectAll.indeterminate}
        onChange={selectAll.onChange}
        slotProps={{ input: { 'aria-label': selectAll.label ?? 'Select all' } }}
      />
    )}
    <Box sx={{ flexGrow: 1 }} />
    {children}
  </Box>
);
