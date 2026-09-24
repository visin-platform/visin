import { Box, Button, Chip, Container, Stack, Typography, useMediaQuery } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import GitHubIcon from './GitHubIcon';
import { BrowserFrame, PhoneFrame } from './Frames';
import { GITHUB_URL } from '../content';
import { INK } from '../theme';

const BADGES = ['Open source, MIT', 'Runs on your hardware', 'Connects to AI tools'];

const outlinedOnInk = {
  borderRadius: 2,
  whiteSpace: 'nowrap',
  color: '#fff',
  borderColor: 'rgba(255,255,255,0.3)',
  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.06)' }
} as const;

interface HeroProps {
  appUrl: string;
}

/**
 * One line of promise, then the product itself: a real recording of the app —
 * a project's runs, one opened, its curves, then runs compared at their best and
 * exported for a paper — with the installed phone app beside it. Someone who
 * asked for less motion gets the still frame.
 */
export default function Hero({ appUrl }: HeroProps) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <Box
      component="section"
      id="top"
      sx={{
        bgcolor: INK,
        color: '#fff',
        pt: { xs: 7, md: 11 },
        pb: { xs: 8, md: 12 },
        overflow: 'hidden',
        backgroundImage:
          'radial-gradient(900px 420px at 50% -10%, rgba(37,99,235,0.38), transparent 62%), radial-gradient(600px 360px at 95% 60%, rgba(96,165,250,0.14), transparent 60%)'
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', maxWidth: 820, mx: 'auto' }}>
          <Stack direction="row" sx={{ justifyContent: 'center', flexWrap: 'wrap', gap: 1, mb: 3 }}>
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

          <Typography variant="h1" sx={{ fontSize: { xs: '2.4rem', sm: '3.25rem', md: '4rem' }, lineHeight: 1.05, mb: 2.5 }}>
            A clear view of your computer vision work
          </Typography>

          <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.25rem' }, color: 'rgba(255,255,255,0.75)', mb: 4 }}>
            Track experiments, compare results, label images, and review the data behind each decision.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center' }}>
            <Button href={appUrl} variant="contained" size="large" endIcon={<ArrowForward />} sx={{ borderRadius: 2, whiteSpace: 'nowrap' }}>
              Open the app
            </Button>
            <Button href="#assistant" variant="outlined" size="large" sx={outlinedOnInk}>
              Connect an assistant
            </Button>
            <Button
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              size="large"
              startIcon={<GitHubIcon />}
              sx={outlinedOnInk}
            >
              Read the source
            </Button>
          </Stack>
        </Box>

        <Box sx={{ position: 'relative', mt: { xs: 6, md: 9 }, mx: 'auto', maxWidth: 1040, pr: { md: 7 } }}>
          <BrowserFrame>
            <Box
              component="video"
              src="/showcase/tour.webm"
              poster="/showcase/tour-poster.webp"
              autoPlay={!reducedMotion}
              loop
              muted
              playsInline
              preload="metadata"
              aria-label="A tour of Visin: a project's training runs, one opened with its curves and per-class scores, then nine runs compared at their best epoch and exported as LaTeX"
              // The app's dark page, so the frame is the right colour before the first frame arrives.
              sx={{ display: 'block', width: '100%', aspectRatio: '1440 / 900', bgcolor: '#0b0f17' }}
            />
          </BrowserFrame>
          <PhoneFrame
            src="/showcase/phone-trainings.webp"
            alt="The same runs in the app installed on a phone"
            sx={{
              display: { xs: 'none', md: 'block' },
              position: 'absolute',
              right: 0,
              bottom: -40,
              width: 200
            }}
          />
        </Box>
      </Container>
    </Box>
  );
}
