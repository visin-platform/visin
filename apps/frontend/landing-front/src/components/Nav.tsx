import { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Container,
  Drawer,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography
} from '@mui/material';
import { Menu as MenuIcon, Close } from '@mui/icons-material';
import GitHubIcon from './GitHubIcon';
import { GITHUB_URL } from '../content';
import { INK } from '../theme';

const LINKS = [
  { label: 'Analysis', href: '#assistant' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Self-hosting', href: '#open-source' },
  { label: 'Contact', href: '#contact' }
];

interface NavProps {
  appUrl: string;
}

export default function Nav({ appUrl }: NavProps) {
  const [open, setOpen] = useState(false);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{ bgcolor: INK, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      <Container maxWidth="lg" disableGutters>
        <Toolbar sx={{ gap: 2, px: { xs: 2, sm: 3 } }}>
          <Box component="a" href="#top" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none' }}>
            <Box component="img" src="/logo.svg" alt="" sx={{ width: 30, height: 30 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}>
              Visin
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box component="nav" aria-label="Main" sx={{ display: { xs: 'none', md: 'flex' }, gap: 3, mr: 1 }}>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                underline="none"
                sx={{
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: '0.925rem',
                  fontWeight: 500,
                  '&:hover': { color: '#fff' }
                }}
              >
                {link.label}
              </Link>
            ))}
          </Box>

          <IconButton
            component="a"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visin on GitHub"
            sx={{ color: 'rgba(255,255,255,0.72)', '&:hover': { color: '#fff' } }}
          >
            <GitHubIcon fontSize="small" />
          </IconButton>

          <Button
            href={appUrl}
            variant="contained"
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, borderRadius: 2 }}
          >
            Open the app
          </Button>

          <IconButton
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            sx={{ display: { md: 'none' }, color: '#fff' }}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </Container>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: INK, color: '#fff', width: 260 } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
          <IconButton onClick={() => setOpen(false)} aria-label="Close menu" sx={{ color: '#fff' }}>
            <Close />
          </IconButton>
        </Box>
        <List>
          {LINKS.map((link) => (
            <ListItem key={link.href} disablePadding>
              <ListItemButton component="a" href={link.href} onClick={() => setOpen(false)}>
                <ListItemText primary={link.label} />
              </ListItemButton>
            </ListItem>
          ))}
          <ListItem disablePadding>
            <ListItemButton component="a" href={appUrl} onClick={() => setOpen(false)}>
              <ListItemText primary="Open the app" slotProps={{ primary: { sx: { fontWeight: 700 } } }} />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
    </AppBar>
  );
}
