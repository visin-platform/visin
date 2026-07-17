import { ReactNode, useState, MouseEvent } from 'react';
import {
  Box,
  Drawer,
  List,
  Typography,
  Divider,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  useTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  IconButton
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Menu as MenuIcon, Logout, Person } from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';

const DRAWER_WIDTH = 260;

export interface AppLayoutNavItem {
  text: string;
  icon: ReactNode;
  path: string;
}

export interface AppLayoutFooterLink {
  text: string;
  icon: ReactNode;
  href: string;
}

export interface AppLayoutUser {
  name?: string;
  email?: string;
  picture?: string;
}

export interface AppLayoutProps {
  children: ReactNode;
  /** Shown in the mobile app bar and as the fallback desktop page title. */
  appName: string;
  /** Static description shown under the desktop page title. */
  subtitle: string;
  navItems: AppLayoutNavItem[];
  user: AppLayoutUser | null;
  onLogout: () => void;
  /** Optional link pinned below the nav list, e.g. "Back to Vision". */
  footerLink?: AppLayoutFooterLink;
  /** Max width of the centered content column. Defaults to 800. */
  maxContentWidth?: number;
}

/**
 * Shared sidebar/appbar shell used by the account and label fronts: fixed
 * dark drawer with nav items, mobile temporary drawer, avatar menu with
 * logout, and a centered content column with a page title derived from the
 * active nav item. vision-front's collapsible-drawer layout has different
 * enough behavior (login/logout dual state, no page-title header) that it
 * stays a standalone component rather than forcing it through these props.
 */
export function AppLayout({
  children,
  appName,
  subtitle,
  navItems,
  user,
  onLogout,
  footerLink,
  maxContentWidth = 800
}: AppLayoutProps) {
  const location = useLocation();
  const theme = useTheme();

  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleOpenUserMenu = (event: MouseEvent<HTMLElement>) => setAnchorElUser(event.currentTarget);
  const handleCloseUserMenu = () => setAnchorElUser(null);

  // An exact match always wins; a prefix match only counts if no other nav
  // item is an exact match for the current path (avoids '/jobs' lighting up
  // while on '/jobs/new').
  const isActive = (path: string) =>
    location.pathname === path ||
    (location.pathname.startsWith(path + '/') &&
      !navItems.some((item) => item.path !== path && item.path === location.pathname));

  const activeItem = navItems.find((item) => isActive(item.path));

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#111827', color: '#fff' }}>
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component="img" src="/logo.svg" alt="Visin Logo" sx={{ width: 32, height: 32 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'inherit', letterSpacing: '-0.5px' }}>
          Visin
        </Typography>
      </Box>

      <List sx={{ px: 2, flexGrow: 1 }}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={Link}
                to={item.path}
                selected={active}
                onClick={() => setMobileOpen(false)}
                sx={{
                  borderRadius: 2,
                  py: 1.2,
                  color: 'rgba(255,255,255,0.7)',
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                    color: theme.palette.primary.light,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.25)
                    },
                    '& .MuiListItemIcon-root': {
                      color: theme.palette.primary.light
                    }
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    '& .MuiListItemIcon-root': {
                      color: '#fff'
                    }
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: active ? 'inherit' : 'rgba(255,255,255,0.5)' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  slotProps={{
                    primary: { sx: { fontWeight: active ? 600 : 500, fontSize: '0.925rem' } }
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {footerLink && (
        <>
          <Divider sx={{ mx: 2, opacity: 0.1, bgcolor: 'rgba(255,255,255,0.1)' }} />
          <List sx={{ px: 2, py: 2 }}>
            <ListItem disablePadding>
              <ListItemButton
                component="a"
                href={footerLink.href}
                sx={{
                  borderRadius: 2,
                  py: 1.2,
                  color: 'rgba(255,255,255,0.5)',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    '& .MuiListItemIcon-root': {
                      color: '#fff'
                    }
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{footerLink.icon}</ListItemIcon>
                <ListItemText
                  primary={footerLink.text}
                  slotProps={{ primary: { sx: { fontWeight: 500, fontSize: '0.925rem' } } }}
                />
              </ListItemButton>
            </ListItem>
          </List>
        </>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />
      {/* AppBar for Mobile */}
      <AppBar
        position="fixed"
        sx={{
          display: { sm: 'none' },
          bgcolor: '#111827',
          color: '#fff',
          boxShadow: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <Toolbar>
          <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700, flexGrow: 1 }}>
            {appName}
          </Typography>
          <Avatar
            src={user?.picture}
            sx={{ width: 32, height: 32, border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={handleOpenUserMenu}
          />
        </Toolbar>
      </AppBar>
      {/* Sidebar for Desktop */}
      <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: 'none',
              bgcolor: '#111827',
              color: '#fff'
            }
          }}
        >
          {drawer}
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: '1px solid rgba(255,255,255,0.1)',
              bgcolor: '#111827',
              color: '#fff'
            }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 4, md: 8 },
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: { xs: 7, sm: 0 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <Box sx={{ width: '100%', maxWidth: maxContentWidth }}>
          {/* Desktop Header */}
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'space-between', alignItems: 'center', mb: 8 }}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-1px', mb: 1 }}>
                {activeItem?.text || appName}
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                {subtitle}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {user?.name || 'User'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {user?.email}
                </Typography>
              </Box>
              <IconButton onClick={handleOpenUserMenu} sx={{ p: 0.5, border: '1px solid', borderColor: 'divider' }}>
                <Avatar src={user?.picture} sx={{ width: 40, height: 40 }}>
                  <Person />
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={anchorElUser}
                open={Boolean(anchorElUser)}
                onClose={handleCloseUserMenu}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                slotProps={{
                  paper: { sx: { mt: 1.5, minWidth: 200, borderRadius: 2, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' } }
                }}
              >
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="subtitle2" noWrap>
                    {user?.name}
                  </Typography>
                  <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>
                    {user?.email}
                  </Typography>
                </Box>
                <Divider />
                <MenuItem
                  onClick={() => {
                    handleCloseUserMenu();
                    onLogout();
                  }}
                  sx={{ py: 1.5 }}
                >
                  <ListItemIcon>
                    <Logout fontSize="small" />
                  </ListItemIcon>
                  Logout
                </MenuItem>
              </Menu>
            </Box>
          </Box>

          {children}
        </Box>
      </Box>
    </Box>
  );
}
