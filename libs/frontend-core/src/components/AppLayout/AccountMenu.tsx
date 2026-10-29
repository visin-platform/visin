import { ReactNode } from 'react';
import { Avatar, Box, Divider, Drawer, ListItemIcon, ListItemText, Menu, MenuItem, MenuList, Typography } from '@mui/material';
import { Logout, Person } from '@mui/icons-material';
import { glass } from '../../theme';
import type { AppLayoutNavItem, AppLayoutUser } from './types';

/** The letter on a user's avatar when they have no picture, or a person icon when they have no name. */
export const userInitial = (user?: AppLayoutUser | null): ReactNode => user?.name?.charAt(0) || <Person fontSize="small" />;

interface AccountMenuProps {
  /** A phone gets a bottom sheet; a desktop gets a menu under the avatar. */
  mobile: boolean;
  /** The avatar the menu opens from; the menu is open while this is set. */
  anchor: HTMLElement | null;
  onClose: () => void;
  user?: AppLayoutUser | null;
  accountItems: AppLayoutNavItem[];
  /** One menu entry for a nav item, closing the menu when it is chosen. */
  renderItem: (item: AppLayoutNavItem, onClose: () => void) => ReactNode;
  onLogout: () => void;
}

/** The account menu: who is signed in, the account pages, and logging out. */
export function AccountMenu({ mobile, anchor, onClose, user, accountItems, renderItem, onLogout }: AccountMenuProps) {
  const initial = userInitial(user);

  // An array rather than a fragment: Menu and MenuList walk their direct
  // children to manage focus.
  const accountMenuItems = [
    <MenuItem key="who" disabled sx={{ gap: 1.5, py: 1.25, '&.Mui-disabled': { opacity: 1 } }}>
      <Avatar src={user?.picture} alt="" sx={{ width: 36, height: 36, bgcolor: 'secondary.main' }}>
        {initial}
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
    </MenuItem>,
    <Divider key="who-divider" />,
    ...accountItems.map((item) => renderItem(item, onClose)),
    ...(accountItems.length > 0 ? [<Divider key="logout-divider" />] : []),
    <MenuItem
      key="logout"
      onClick={() => {
        onClose();
        onLogout();
      }}
    >
      <ListItemIcon>
        <Logout fontSize="small" />
      </ListItemIcon>
      <ListItemText>Logout</ListItemText>
    </MenuItem>
  ];

  return mobile ? (
    <Drawer
      anchor="bottom"
      open={Boolean(anchor)}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            ...glass,
            borderBottom: 'none',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '85dvh',
            pb: 'calc(8px + env(safe-area-inset-bottom))'
          }
        }
      }}
    >
      <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.25 }} />
      <MenuList aria-label="Account" autoFocusItem={Boolean(anchor)}>
        {accountMenuItems}
      </MenuList>
    </Drawer>
  ) : (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: { sx: { mt: 0.5, minWidth: 240, maxWidth: 320, borderRadius: 3 } },
        list: { 'aria-label': 'Account' }
      }}
    >
      {accountMenuItems}
    </Menu>
  );
}

export default AccountMenu;
