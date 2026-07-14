import React, { useState } from 'react';
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
  alpha,
  CssBaseline,
  AppBar,
  Toolbar,
  IconButton
} from '@mui/material';
import {
  ModelTraining,
  Storage,
  Image as ImageIcon,
  ExpandMore,
  Menu as MenuIcon,
  ChevronLeft,
  ChevronRight,
  Login,
  Folder
} from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

const DRAWER_WIDTH = 280;
const COLLAPSED_DRAWER_WIDTH = 88;

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const theme = useTheme();
  const { user, isAuthenticated, login, logout } = useAuth();
  
  // State for placeholders
  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  const handleDrawerClose = () => {
    setIsClosing(true);
    setMobileOpen(false);
  };

  const handleDrawerTransitionEnd = () => {
    setIsClosing(false);
  };

  const handleDrawerToggle = () => {
    if (!isClosing) {
      setMobileOpen(!mobileOpen);
    }
  };

  const handleDesktopDrawerToggle = () => {
    setDesktopOpen(!desktopOpen);
  };

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElUser(event.currentTarget);
  };

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };

  const getAccountUrl = () => {
    try {
      const conf = getGlobalConfig();
      return conf.ACCOUNT_FRONT_URL || import.meta.env.VITE_ACCOUNT_FRONT_URL || 'http://localhost:3007';
    } catch {
      return import.meta.env.VITE_ACCOUNT_FRONT_URL || 'http://localhost:3007';
    }
  };

  const menuItems = [
    { text: 'Projects', icon: <Folder />, path: '/projects' },
    { text: 'Trainings', icon: <ModelTraining />, path: '/trainings' },
    { text: 'Datasets', icon: <Storage />, path: '/datasets' },
    { text: 'Image Labeling', icon: <ImageIcon />, path: '/image-labeling' },
  ];

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const getDrawerContent = (collapsed: boolean) => (
    <>
      {/* logo.svg & Tenant Selector Area */}
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'flex-start' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, width: '100%', justifyContent: collapsed ? 'center' : 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box 
              component="img"
              src="/logo.svg"
              alt="Visin Logo"
              sx={{ 
                width: 32, 
                height: 32, 
                flexShrink: 0
              }}
            />
            {!collapsed && (
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: "inherit"
                }}>
                Visin
              </Typography>
            )}
          </Box>
          
          {/* Desktop Toggle Button */}
          {!collapsed && (
            <IconButton 
              onClick={handleDesktopDrawerToggle}
              sx={{ 
                color: 'rgba(255,255,255,0.5)',
                display: { xs: 'none', sm: 'flex' },
                p: 0.5
              }}
            >
              <ChevronLeft />
            </IconButton>
          )}
        </Box>

        {collapsed ? (
           <IconButton 
            onClick={handleDesktopDrawerToggle}
            sx={{ 
              mb: 0,
              color: 'rgba(255,255,255,0.5)',
              display: { xs: 'none', sm: 'flex' }
            }}
          >
            <ChevronRight />
          </IconButton>
        ) : null}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Navigation Items */}
      <List sx={{ px: 2, py: 2 }}>
        {menuItems.map((item) => {
          const active = isActive(item.path);
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5, display: 'block' }}>
              <ListItemButton
                component={Link}
                to={item.path}
                selected={active}
                onClick={() => {
                  // Close drawer on mobile when item is clicked
                  if (mobileOpen) handleDrawerClose();
                }}
                sx={{
                  minHeight: 48,
                  justifyContent: collapsed ? 'center' : 'initial',
                  px: 2.5,
                  borderRadius: 2,
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                    color: theme.palette.primary.light,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.25),
                    },
                    '& .MuiListItemIcon-root': {
                      color: theme.palette.primary.light,
                    }
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.05)',
                  }
                }}
              >
                <ListItemIcon 
                  sx={{ 
                    minWidth: 0,
                    mr: collapsed ? 0 : 3,
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.5)' 
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  sx={{ opacity: collapsed ? 0 : 1, display: collapsed ? 'none' : 'block' }}
                  slotProps={{
                    primary: {
                      sx: {
                        fontSize: '0.9rem',
                        fontWeight: active ? 600 : 400
                      }
                    }
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Box sx={{ flexGrow: 1 }} />
      
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* User Account Section */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        {isAuthenticated ? (
          <>
            <ListItemButton
              onClick={handleOpenUserMenu}
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
                {user?.name?.charAt(0) || 'U'}
              </Avatar>
              {!collapsed && (
                <>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" sx={{
                      fontWeight: 600
                    }}>{user?.name}</Typography>
                    <Typography variant="caption" sx={{
                      color: "rgba(255,255,255,0.5)"
                    }}>{user?.email}</Typography>
                  </Box>
                  <ExpandMore sx={{ color: 'rgba(255,255,255,0.5)' }} />
                </>
              )}
            </ListItemButton>
            <Menu
              sx={{ mt: -1 }}
              id="menu-appbar"
              anchorEl={anchorElUser}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              keepMounted
              transformOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              open={Boolean(anchorElUser)}
              onClose={handleCloseUserMenu}
            >
              <MenuItem onClick={() => { handleCloseUserMenu(); window.location.href = getAccountUrl(); }}>Account</MenuItem>
              <Divider />
              <MenuItem onClick={() => { handleCloseUserMenu(); logout(); }}>Logout</MenuItem>
            </Menu>
          </>
        ) : (
          <ListItemButton
            onClick={login}
            sx={{
              borderRadius: 2,
              justifyContent: collapsed ? 'center' : 'initial',
              px: collapsed ? 1 : 2,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
            }}
          >
            <ListItemIcon 
              sx={{ 
                minWidth: 0,
                mr: collapsed ? 0 : 2,
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.5)' 
              }}
            >
              <Login />
            </ListItemIcon>
            {!collapsed && (
              <ListItemText
                primary="Login"
                slotProps={{
                  primary: {
                    sx: {
                      fontSize: '0.9rem',
                      fontWeight: 600
                    }
                  }
                }}
              />
            )}
          </ListItemButton>
        )}
      </Box>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />
      {/* Mobile App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${desktopOpen ? DRAWER_WIDTH : COLLAPSED_DRAWER_WIDTH}px)` },
          ml: { sm: `${desktopOpen ? DRAWER_WIDTH : COLLAPSED_DRAWER_WIDTH}px` },
          display: { sm: 'none' },
          bgcolor: '#111827',
          color: '#fff'
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="img" src="/logo.svg" alt="Visin Logo" sx={{ width: 24, height: 24 }} />
            <Typography variant="h6" noWrap component="div" sx={{
              fontWeight: 700
            }}>
              Visin
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>
      {/* Sidebar Navigation */}
      <Box
        component="nav"
        sx={{ width: { sm: desktopOpen ? DRAWER_WIDTH : COLLAPSED_DRAWER_WIDTH }, flexShrink: { sm: 0 }, transition: 'width 0.2s' }}
        aria-label="mailbox folders"
      >
        {/* Mobile Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onTransitionEnd={handleDrawerTransitionEnd}
          onClose={handleDrawerClose}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: DRAWER_WIDTH,
              bgcolor: '#111827',
              color: '#fff',
            },
          }}
        >
          {getDrawerContent(false)}
        </Drawer>
        
        {/* Desktop Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: desktopOpen ? DRAWER_WIDTH : COLLAPSED_DRAWER_WIDTH,
              bgcolor: '#111827',
              color: '#fff',
              borderRight: '1px solid rgba(255,255,255,0.1)',
              transition: 'width 0.2s',
              overflowX: 'hidden'
            },
          }}
          open
        >
          {getDrawerContent(!desktopOpen)}
        </Drawer>
      </Box>
      {/* Main Content */}
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          bgcolor: 'background.default',
          minHeight: '100vh', 
          display: 'flex', 
          flexDirection: 'column',
          width: { xs: '100%', sm: `calc(100% - ${desktopOpen ? DRAWER_WIDTH : COLLAPSED_DRAWER_WIDTH}px)` },
          transition: 'width 0.2s',
          overflowX: 'hidden' // Prevent horizontal scroll on main content
        }}
      >
        {/* Toolbar spacer for mobile */}
        <Toolbar sx={{ display: { sm: 'none' } }} />
        
        {/* Content Area */}
        <Box sx={{ p: 1, flexGrow: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default AppLayout;
