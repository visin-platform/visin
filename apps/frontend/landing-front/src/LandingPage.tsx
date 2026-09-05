import { Box, CssBaseline, Link, ThemeProvider } from '@mui/material';
import { useConfig } from './config/ConfigProvider';
import { theme } from './theme';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Workflow from './components/Workflow';
import Features from './components/Features';
import Assistant from './components/Assistant';
import OpenSource from './components/OpenSource';
import Contact from './components/Contact';
import Footer from './components/Footer';

function LandingPage() {
  const config = useConfig();
  const appUrl = config.VISION_FRONT_URL || '#';

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
        <Hero appUrl={appUrl} />
        <Assistant />
        <Workflow />
        <Features />
        <OpenSource />
        <Contact />
      </Box>

      <Footer appUrl={appUrl} />
    </ThemeProvider>
  );
}

export default LandingPage;
