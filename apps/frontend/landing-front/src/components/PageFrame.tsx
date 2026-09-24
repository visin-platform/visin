import type { ReactNode } from 'react';
import { Box, CssBaseline, Link, ThemeProvider } from '@mui/material';
import { useConfig } from '../config/ConfigProvider';
import { theme } from '../theme';
import Nav from './Nav';
import Footer from './Footer';

interface PageFrameProps {
  children: ReactNode;
}

/** What the landing page and the docs share: the theme, the skip link, the nav and the footer. */
export default function PageFrame({ children }: PageFrameProps) {
  const config = useConfig();
  const appUrl = config.SHELL_FRONT_URL || '#';

  return (
    // Light only, and not remembered: the page has no switch, and must not
    // pick up the app's stored choice (`visin-mode`) on a shared origin.
    <ThemeProvider theme={theme} defaultMode="light" storageManager={null}>
      <CssBaseline enableColorScheme />
      {/* Keyboard users can skip the nav; visible only once focused. */}
      <Link
        href="#main"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 8,
          zIndex: 2000,
          px: 2,
          py: 1,
          borderRadius: 1,
          bgcolor: 'background.paper',
          '&:focus': { left: 8 }
        }}
      >
        Skip to content
      </Link>

      <Nav appUrl={appUrl} />

      <Box component="main" id="main">
        {children}
      </Box>

      <Footer appUrl={appUrl} />
    </ThemeProvider>
  );
}
