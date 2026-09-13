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
import {
  Menu as MenuIcon,
  Logout,
  Person,
  Login,
  ChevronLeft,
  ChevronRight,
  ExpandMore,
  AccountCircle
} from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';

const DRAWER_WIDTH = 260;
const COLLAPSED_DRAWER_WIDTH = 88;

interface NavItemBase {
  text: string;
  icon: ReactNode;
  /**
   * Heading this item is listed under. Consecutive items sharing a group are
   * drawn together beneath one heading; an item without one gets no heading.
   */
  group?: string;
}

/** A section of the current app, navigated to client-side. */
export interface AppLayoutInternalNavItem extends NavItemBase {
  path: string;
  href?: undefined;
}

/** A section owned by a sibling app, reached by a full page load. */
export interface AppLayoutExternalNavItem extends NavItemBase {
  href: string;
  path?: undefined;
}

export type AppLayoutNavItem = AppLayoutInternalNavItem | AppLayoutExternalNavItem;

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
  /** Max width of the centered content column. Defaults to 800. */
  maxContentWidth?: number;
  /**
   * False shows a Login button in place of the user block. Defaults to true —
   * only vision-front serves anonymous visitors.
   */
  isAuthenticated?: boolean;
  /** Required when `isAuthenticated` can be false. */
  onLogin?: () => void;
  /** Adds an "Account" entry to the user menu, linking to account-front. */
  accountUrl?: string;
  /** Lets the desktop drawer collapse to an icon rail. Defaults to false. */
  collapsible?: boolean;
  /**
   * False drops the page title/subtitle header, for apps whose pages render
   * their own headings. Defaults to true.
   */
  showPageHeader?: boolean;
}

/**
 * The single sidebar/appbar shell behind every Visin front: dark drawer with
 * nav items, mobile temporary drawer, a user block pinned to the drawer
 * bottom, and a content column. vision-front used to carry its own
 * near-duplicate of this so it could collapse the drawer and serve anonymous
 * visitors; those are now options here, so navigation looks and behaves
 * identically across apps.
 *
 * Account, Logout and Login all live in the drawer's user block, never in a
 * page header: a header user block costs every page a band of vertical space
 * and puts account actions somewhere different from the navigation.
 */
export function AppLayout({
  children,
  appName,
  subtitle,
  navItems,
  user,
  onLogout,
  maxContentWidth = 800,
  isAuthenticated = true,
  onLogin,
  accountUrl,
  collapsible = false,
  showPageHeader = true
}: AppLayoutProps) {
  const location = useLocation();
  const theme = useTheme();

  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  const drawerWidth = collapsible && !desktopOpen ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH;

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleOpenUserMenu = (event: MouseEvent<HTMLElement>) => setAnchorElUser(event.currentTarget);
  const handleCloseUserMenu = () => setAnchorElUser(null);

  // An exact match always wins; a prefix match only counts if no other nav
  // item is an exact match for the current path (avoids '/jobs' lighting up
  // while on '/jobs/new'). External items are never active — they belong to a
  // different app.
  const isActive = (item: AppLayoutNavItem) =>
    item.path !== undefined &&
    (location.pathname === item.path ||
      (location.pathname.startsWith(item.path + '/') &&
        !navItems.some((other) => other.path !== item.path && other.path === location.pathname)));

  const activeItem = navItems.find(isActive);

  // The mobile drawer is temporary and always renders expanded — collapsing to
  // an icon rail only makes sense for the permanent desktop one.
  const renderDrawer = (variant: 'mobile' | 'desktop') => {
    const collapsed = variant === 'desktop' && collapsible && !desktopOpen;
    const showCollapseToggle = variant === 'desktop' && collapsible;

    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#111827', color: '#fff' }}>
        <Box
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            justifyContent: collapsed ? 'center' : 'space-between'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box component="img" src="/logo.svg" alt="Visin Logo" sx={{ width: 32, height: 32, flexShrink: 0 }} />
            {!collapsed && (
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'inherit', letterSpacing: '-0.5px' }}>
                Visin
              </Typography>
            )}
          </Box>
          {showCollapseToggle && (
            <IconButton
              onClick={() => setDesktopOpen(!desktopOpen)}
              aria-label={collapsed ? 'expand navigation' : 'collapse navigation'}
              sx={{ color: 'rgba(255,255,255,0.5)', display: { xs: 'none', sm: 'flex' }, p: 0.5 }}
            >
              {collapsed ? <ChevronRight /> : <ChevronLeft />}
            </IconButton>
          )}
        </Box>

        <List sx={{ px: 2, flexGrow: 1, overflowY: 'auto' }}>
          {navItems.map((item, index) => {
            const active = isActive(item);
            // An external item is a plain anchor: it belongs to a sibling app,
            // so it needs a full page load, not a client-side route change. It
            // is otherwise drawn exactly like a local one — the menu is one
            // product, not a list of apps.
            const linkProps =
              item.path !== undefined
                ? { component: Link, to: item.path }
                : { component: 'a' as const, href: item.href };
            const startsGroup = item.group !== undefined && item.group !== navItems[index - 1]?.group;

            return (
              <ListItem key={item.text} disablePadding sx={{ mb: 0.5, display: 'block' }}>
                {startsGroup &&
                  (collapsed ? (
                    // The icon rail has no room for a label; a rule still shows
                    // where one group ends.
                    index > 0 && <Divider sx={{ my: 1.5, mx: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
                  ) : (
                    <Typography
                      component="div"
                      sx={{
                        px: 2,
                        pt: index > 0 ? 2 : 0,
                        pb: 1,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.4)'
                      }}
                    >
                      {item.group}
                    </Typography>
                  ))}
                <ListItemButton
                  {...linkProps}
                  selected={active}
                  onClick={() => setMobileOpen(false)}
                  sx={{
                    borderRadius: 2,
                    py: 1.2,
                    justifyContent: collapsed ? 'center' : 'initial',
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
                  <ListItemIcon
                    sx={{
                      minWidth: collapsed ? 0 : 40,
                      justifyContent: 'center',
                      color: active ? 'inherit' : 'rgba(255,255,255,0.5)'
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.text}
                      slotProps={{
                        primary: { sx: { fontWeight: active ? 600 : 500, fontSize: '0.925rem' } }
                      }}
                    />
                  )}
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>

        <Divider sx={{ mx: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

        <Box sx={{ p: 2 }}>
          {isAuthenticated ? (
            <ListItemButton
              onClick={handleOpenUserMenu}
              aria-label="open user menu"
              sx={{
                borderRadius: 2,
                justifyContent: collapsed ? 'center' : 'initial',
                px: collapsed ? 1 : 2,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
              }}
            >
              <Avatar
                src={user?.picture}
                sx={{ width: 32, height: 32, mr: collapsed ? 0 : 2, bgcolor: theme.palette.secondary.main }}
              >
                {user?.name?.charAt(0) || <Person fontSize="small" />}
              </Avatar>
              {!collapsed && (
                <>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {user?.name || 'User'}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                      {user?.email}
                    </Typography>
                  </Box>
                  <ExpandMore sx={{ color: 'rgba(255,255,255,0.5)' }} />
                </>
              )}
            </ListItemButton>
          ) : (
            <ListItemButton
              onClick={onLogin}
              sx={{
                borderRadius: 2,
                justifyContent: collapsed ? 'center' : 'initial',
                px: collapsed ? 1 : 2,
                color: 'rgba(255,255,255,0.7)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }
              }}
            >
              <ListItemIcon
                sx={{ minWidth: collapsed ? 0 : 40, justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}
              >
                <Login />
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary="Login"
                  slotProps={{ primary: { sx: { fontWeight: 600, fontSize: '0.925rem' } } }}
                />
              )}
            </ListItemButton>
          )}
        </Box>
      </Box>
    );
  };

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
        </Toolbar>
      </AppBar>
      {/* Sidebar for Desktop */}
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 }, transition: 'width 0.2s' }}>
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
          {renderDrawer('mobile')}
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: '1px solid rgba(255,255,255,0.1)',
              bgcolor: '#111827',
              color: '#fff',
              transition: 'width 0.2s',
              overflowX: 'hidden'
            }
          }}
          open
        >
          {renderDrawer('desktop')}
        </Drawer>
      </Box>

      {/* Rendered once, outside both drawers, so the two user buttons share it. */}
      <Menu
        anchorEl={anchorElUser}
        open={Boolean(anchorElUser)}
        onClose={handleCloseUserMenu}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
        slotProps={{
          paper: { sx: { minWidth: 200, borderRadius: 2, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' } }
        }}
      >
        {accountUrl && (
          <MenuItem
            onClick={() => {
              handleCloseUserMenu();
              window.location.href = accountUrl;
            }}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon>
              <AccountCircle fontSize="small" />
            </ListItemIcon>
            Account
          </MenuItem>
        )}
        {accountUrl && <Divider />}
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

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 4, md: 8 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          transition: 'width 0.2s',
          mt: { xs: 7, sm: 0 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <Box sx={{ width: '100%', maxWidth: maxContentWidth }}>
          {showPageHeader && (
            <Box sx={{ display: { xs: 'none', sm: 'block' }, mb: 6 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-1px', mb: 1 }}>
                {activeItem?.text || appName}
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                {subtitle}
              </Typography>
            </Box>
          )}

          {children}
        </Box>
      </Box>
    </Box>
  );
}
