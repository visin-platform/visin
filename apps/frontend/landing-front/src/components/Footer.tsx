import { Box, Container, Divider, Link, Stack, Typography } from '@mui/material';
import GitHubIcon from './GitHubIcon';
import { GITHUB_URL } from '../content';
import { INK } from '../theme';

const FOOTER_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Self-hosting', href: '#open-source' },
  { label: 'Contact', href: '#contact' }
];

interface FooterProps {
  appUrl: string;
}

export default function Footer({ appUrl }: FooterProps) {
  return (
    <Box component="footer" sx={{ bgcolor: INK, color: 'rgba(255,255,255,0.7)', pt: { xs: 6, md: 8 }, pb: 4 }}>
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 4, md: 2 }}
          sx={{ mb: 5, justifyContent: 'space-between' }}
        >
          <Box sx={{ maxWidth: 320 }}>
            <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, alignItems: 'center' }}>
              <Box component="img" src="/logo.svg" alt="" sx={{ width: 28, height: 28 }} />
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                Visin
              </Typography>
            </Stack>
            <Typography variant="body2">
              An open-source workbench for computer vision datasets, labeling, and experiments.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 6 }}>
            <Stack spacing={1.25} component="nav" aria-label="Footer">
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  underline="none"
                  variant="body2"
                  sx={{ color: 'inherit', '&:hover': { color: '#fff' } }}
                >
                  {link.label}
                </Link>
              ))}
            </Stack>
            <Stack spacing={1.25}>
              <Link href={appUrl} underline="none" variant="body2" sx={{ color: 'inherit', '&:hover': { color: '#fff' } }}>
                Open the app
              </Link>
              <Link
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                underline="none"
                variant="body2"
                sx={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 0.75, '&:hover': { color: '#fff' } }}
              >
                <GitHubIcon sx={{ fontSize: 16 }} />
                GitHub
              </Link>
            </Stack>
          </Stack>
        </Stack>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 3 }} />

        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
          © {new Date().getFullYear()} Visin. Open source under the MIT License.
        </Typography>
      </Container>
    </Box>
  );
}
