import { Box, Button, Chip, Container, Grid, Stack, Typography } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import GitHubIcon from './GitHubIcon';
import ProductVisual from './ProductVisual';
import { GITHUB_URL } from '../content';
import { INK } from '../theme';

const BADGES = ['Analyses your runs with Claude', 'Open source, MIT', 'Self-hosted'];

interface HeroProps {
  appUrl: string;
}

export default function Hero({ appUrl }: HeroProps) {
  return (
    <Box
      component="section"
      id="top"
      sx={{
        bgcolor: INK,
        color: '#fff',
        pt: { xs: 8, md: 14 },
        pb: { xs: 10, md: 16 },
        // A soft brand-coloured wash instead of a flat block, kept subtle
        // enough that white text stays well above contrast minimums.
        backgroundImage:
          'radial-gradient(900px 400px at 15% -10%, rgba(37,99,235,0.35), transparent 60%), radial-gradient(700px 380px at 90% 10%, rgba(96,165,250,0.18), transparent 55%)'
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 6, md: 8 }} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
              {BADGES.map((badge) => (
                <Chip
                  key={badge}
                  label={badge}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.85)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    fontWeight: 500
                  }}
                />
              ))}
            </Stack>

            <Typography variant="h1" sx={{ fontSize: { xs: '2.5rem', sm: '3.25rem', md: '3.75rem' }, lineHeight: 1.05, mb: 3 }}>
              Ask your training runs what actually happened
            </Typography>

            <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.2rem' }, color: 'rgba(255,255,255,0.75)', mb: 4, maxWidth: 560 }}>
              Visin records every epoch, score and rendered frame your training produces, then lets an AI
              assistant analyse the lot. It answers from the data, not from what you pasted into a chat.
              Runs on your own machines.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button href={appUrl} variant="contained" size="large" endIcon={<ArrowForward />} sx={{ borderRadius: 2, whiteSpace: 'nowrap' }}>
                Open the app
              </Button>
              <Button
                href="#assistant"
                variant="outlined"
                size="large"
                sx={{
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.3)',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.06)' }
                }}
              >
                Connect an assistant
              </Button>
              <Button
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                size="large"
                startIcon={<GitHubIcon />}
                sx={{
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.3)',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.06)' }
                }}
              >
                Read the source
              </Button>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <ProductVisual />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
