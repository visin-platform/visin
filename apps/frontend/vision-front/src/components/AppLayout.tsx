import React from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Button
} from '@mui/material';
import { Link, useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          background: 'transparent',
          color: '#222',
          boxShadow: 'none',
          borderBottom: '1px solid rgba(0,0,0,0.1)'
        }}
      >
        <Toolbar>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              component={Link}
              to="/trainings"
              color="inherit"
              sx={{
                fontWeight: isActive('/trainings') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/trainings') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Trainings
            </Button>
            <Button
              component={Link}
              to="/configs"
              color="inherit"
              sx={{
                fontWeight: isActive('/configs') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/configs') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Configs
            </Button>
            <Button
              component={Link}
              to="/analysis"
              color="inherit"
              sx={{
                fontWeight: isActive('/analysis') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/analysis') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Datasets
            </Button>
            <Button
              component={Link}
              to="/test-results"
              color="inherit"
              sx={{
                fontWeight: isActive('/test-results') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/test-results') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Test Results
            </Button>
            <Button
              component={Link}
              to="/visualizations"
              color="inherit"
              sx={{
                fontWeight: isActive('/visualizations') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/visualizations') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Visualizations
            </Button>
            <Button
              component={Link}
              to="/benchmarks"
              color="inherit"
              sx={{
                fontWeight: isActive('/benchmarks') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/benchmarks') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Benchmarks
            </Button>
            <Button
              component={Link}
              to="/comparisons"
              color="inherit"
              sx={{
                fontWeight: isActive('/comparisons') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/comparisons') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Comparisons
            </Button>
            <Button
              component={Link}
              to="/image-labeling"
              color="inherit"
              sx={{
                fontWeight: isActive('/image-labeling') ? 700 : 500,
                textTransform: 'none',
                background: 'none',
                borderRadius: 2,
                px: 2,
                color: isActive('/image-labeling') ? 'primary.main' : '#222',
                '&:hover': { background: 'rgba(0,0,0,0.04)' }
              }}
            >
              Image Labeling
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: '#fafafa' }}>
        {children}
      </Box>

      <Box
        component="footer"
        sx={{
          py: 2,
          px: 2,
          mt: 'auto',
          bgcolor: '#fff',
          borderTop: '1px solid rgba(0,0,0,0.1)'
        }}
      >
        <Container maxWidth="xl">
          <Typography variant="body2" color="text.secondary" align="center">

          </Typography>
        </Container>
      </Box>
    </Box>
  );
};

export default AppLayout;
