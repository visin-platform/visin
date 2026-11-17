import { ReactNode } from 'react';
import {
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  MenuItem,
  MenuList,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useColorScheme
} from '@mui/material';
import { Logout } from '@mui/icons-material';
import { glass } from '../../theme';
import { linkProps } from './navLinks';
import { userInitial } from './AccountMenu';
import type { AppLayoutNavGroup, AppLayoutNavItem, AppLayoutSiteLink, AppLayoutUser } from './types';

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  /** While the session is still being checked: neither Sign in nor Sign out, rather than the wrong one. */
  authPending?: boolean;
  user?: AppLayoutUser | null;
  /** Groups that did not fit in the tab bar, each one a place to go. */
  places: AppLayoutNavGroup[];
  /** Whether a group is the one being shown. */
  isPlaceActive: (group: AppLayoutNavGroup) => boolean;
  /** What a member can create. */
  createItems: AppLayoutNavItem[];
  /** The few places listed under the person's name. */
  menuItems: AppLayoutNavItem[];
  /** Where the person's own name leads (Account's first page). */
  accountHome?: AppLayoutNavItem;
  siteLinks: AppLayoutSiteLink[];
  /** One menu entry for a nav item, closing the sheet when it is chosen. */
  renderItem: (item: AppLayoutNavItem, onClose: () => void) => ReactNode;
  onLogin?: () => void;
  onSignup?: () => void;
  onLogout: () => void;
}

/**
 * What a phone's tab bar has no room for: the places past its last tab, what the person can create, who they are,
 * the appearance and the links out of the app. One sheet for everyone, signed in or not, so the bar above does not
 * need a button for each of them.
 */
export function MoreSheet({
  open,
  onClose,
  isAuthenticated,
  authPending = false,
  user,
  places,
  isPlaceActive,
  createItems,
  menuItems,
  accountHome,
  siteLinks,
  renderItem,
  onLogin,
  onSignup,
  onLogout
}: MoreSheetProps) {
  const { mode, setMode } = useColorScheme();

  const list: ReactNode[] = [];
  const divider = (key: string) => {
    if (list.length > 0) list.push(<Divider key={key} />);
  };

  if (isAuthenticated) {
    list.push(
      <MenuItem
        key="who"
        {...(accountHome
          ? { ...linkProps(accountHome), onClick: onClose, title: 'Account settings' }
          : { disabled: true })}
        sx={{ gap: 1.5, py: 1.25, '&.Mui-disabled': { opacity: 1 } }}
      >
        <Avatar src={user?.picture} alt="" sx={{ width: 36, height: 36, bgcolor: 'secondary.main' }}>
          {userInitial(user)}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>
            {user?.name || 'User'}
          </Typography>
          {user?.email && (
            <Typography noWrap variant="body2" sx={{ color: 'text.secondary' }}>
              {user.email}
            </Typography>
          )}
        </Box>
      </MenuItem>
    );
  }

  if (places.length > 0) {
    divider('places-divider');
    list.push(
      <ListSubheader key="places-heading" sx={{ background: 'transparent', lineHeight: '32px' }}>
        More
      </ListSubheader>
    );
    for (const group of places) {
      const target = group.items[0];
      list.push(
        <MenuItem key={`place-${group.label}`} {...linkProps(target)} selected={isPlaceActive(group)} onClick={onClose}>
          <ListItemIcon>{group.icon}</ListItemIcon>
          <ListItemText>{group.label}</ListItemText>
        </MenuItem>
      );
    }
  }

  if (isAuthenticated && createItems.length > 0) {
    divider('create-divider');
    list.push(
      <ListSubheader key="create-heading" sx={{ background: 'transparent', lineHeight: '32px' }}>
        New
      </ListSubheader>
    );
    for (const item of createItems) list.push(renderItem(item, onClose));
  }

  if (isAuthenticated && menuItems.length > 0) {
    divider('account-divider');
    for (const item of menuItems) list.push(renderItem(item, onClose));
  }

  if (siteLinks.length > 0) {
    divider('links-divider');
    for (const link of siteLinks) {
      list.push(
        <MenuItem
          key={`link-${link.href}`}
          component="a"
          href={link.href}
          {...(link.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={onClose}
        >
          {link.icon && <ListItemIcon>{link.icon}</ListItemIcon>}
          <ListItemText inset={!link.icon}>{link.text}</ListItemText>
        </MenuItem>
      );
    }
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            ...glass,
            borderBottom: 'none',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '85dvh',
            // The list scrolls; the appearance and signing in or out stay at the foot, where they are always in reach.
            display: 'flex',
            flexDirection: 'column',
            pb: 'calc(8px + env(safe-area-inset-bottom))'
          }
        }
      }}
    >
      <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.25 }} />
      {list.length > 0 && (
        <MenuList aria-label="More" autoFocusItem={open} sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
          {list}
        </MenuList>
      )}

      <Divider sx={{ flexShrink: 0 }} />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 2,
          py: 1.5,
          flexShrink: 0
        }}
      >
        <Typography id="more-appearance" sx={{ fontWeight: 500 }}>
          Appearance
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode ?? 'system'}
          onChange={(_event, next: 'light' | 'dark' | 'system' | null) => next && setMode(next)}
          aria-labelledby="more-appearance"
        >
          <ToggleButton value="light">Light</ToggleButton>
          <ToggleButton value="dark">Dark</ToggleButton>
          <ToggleButton value="system">Auto</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {isAuthenticated && (
        <Box sx={{ px: 1, flexShrink: 0 }}>
          <Button
            fullWidth
            color="inherit"
            startIcon={<Logout fontSize="small" />}
            onClick={() => {
              onClose();
              onLogout();
            }}
            sx={{ justifyContent: 'flex-start', px: 1.5, py: 1, fontWeight: 500 }}
          >
            Sign out
          </Button>
        </Box>
      )}

      {!isAuthenticated && !authPending && (
        <Box sx={{ display: 'flex', gap: 1, px: 2, pb: 1, pt: 0.5, flexShrink: 0 }}>
          <Button
            fullWidth
            variant={onSignup ? 'outlined' : 'contained'}
            onClick={() => {
              onClose();
              onLogin?.();
            }}
          >
            Sign in
          </Button>
          {onSignup && (
            <Button
              fullWidth
              variant="contained"
              onClick={() => {
                onClose();
                onSignup();
              }}
            >
              Sign up
            </Button>
          )}
        </Box>
      )}
    </Drawer>
  );
}
