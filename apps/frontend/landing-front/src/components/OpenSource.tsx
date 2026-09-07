import { Box, Button, Container, Grid, Stack, Typography } from '@mui/material';
import { CheckCircleOutlined } from '@mui/icons-material';
import GitHubIcon from './GitHubIcon';
import { GITHUB_URL, OPEN_SOURCE_POINTS, QUICKSTART } from '../content';
import { INK } from '../theme';

export default function OpenSource() {
  return (
    // Tinted so it separates from the white flow above it. The feature grid
    // used to be the band between the two; with it gone, the two sections ran
    // together as one long white stretch.
    <Box component="section" id="open-source" sx={{ py: { xs: 8, md: 12 }, bgcolor: '#f8fafc' }}>
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 5, md: 8 }}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1.2 }}>
              Self-hosting
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, mt: 1, mb: 2 }}>
              Free, and yours to run
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '1.075rem', mb: 4 }}>
              Visin is a monorepo you clone and deploy. There is no hosted plan, no seat count, and no telemetry
              phoning home.
            </Typography>
            <Button
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              size="large"
              startIcon={<GitHubIcon />}
              sx={{ borderRadius: 2 }}
            >
              Get it on GitHub
            </Button>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2.5}>
              {OPEN_SOURCE_POINTS.map((point) => (
                <Box key={point.title} sx={{ display: 'flex', gap: 2 }}>
                  <CheckCircleOutlined sx={{ color: 'primary.main', mt: 0.25, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.05rem', mb: 0.5 }}>
                      {point.title}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{point.body}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>

            <Box
              sx={{
                mt: 4,
                p: 2.5,
                borderRadius: 2,
                bgcolor: INK,
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.85rem',
                overflowX: 'auto'
              }}
            >
              {QUICKSTART.map((cmd, i) => (
                <Box component="span" key={cmd}>
                  {i > 0 && <br />}
                  <Box component="span" sx={{ color: 'rgba(255,255,255,0.45)', userSelect: 'none' }}>
                    ${' '}
                  </Box>
                  {cmd}
                </Box>
              ))}
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
