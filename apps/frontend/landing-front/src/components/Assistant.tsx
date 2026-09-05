import { Box, Chip, Container, Grid, Paper, Stack, Typography } from '@mui/material';
import { AutoAwesome, CheckCircleOutlined, InfoOutlined } from '@mui/icons-material';
import { ASK_EXAMPLES, ASSISTANT_LIMITS, CONNECT_STEPS, MCP_ENDPOINT } from '../content';
import { INK } from '../theme';

/**
 * The MCP section.
 *
 * Dark, like the hero, because this is the second thing the page is selling and
 * the light sections between them would otherwise run together. The limits are
 * given the same weight as the examples on purpose: an assistant that cannot
 * look at an image is a surprise worth having on the page rather than after
 * someone has connected one.
 */
export default function Assistant() {
  return (
    <Box
      component="section"
      id="assistant"
      sx={{
        bgcolor: INK,
        color: '#fff',
        py: { xs: 8, md: 12 },
        backgroundImage:
          'radial-gradient(800px 380px at 80% 0%, rgba(37,99,235,0.28), transparent 60%)'
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 720, mb: { xs: 5, md: 8 } }}>
          <Typography variant="overline" sx={{ color: 'primary.light', fontWeight: 700, letterSpacing: 1.2 }}>
            Training analysis
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, mt: 1, mb: 2 }}>
            An analyst for your training data
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '1.075rem' }}>
            Every run you record leaves a trail: epoch curves, per-class scores, benchmarks, rendered
            frames. Visin speaks MCP, so Claude reads all of it directly and tells you what it means.
            Then it writes the answer onto the project. Three months later that note is still there.
          </Typography>
        </Box>

        <Grid container spacing={{ xs: 4, md: 6 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography variant="h6" sx={{ mb: 2.5 }}>
              Things people actually ask it
            </Typography>
            <Stack spacing={2}>
              {ASK_EXAMPLES.map((example) => (
                <Paper
                  key={example.question}
                  variant="outlined"
                  sx={{
                    p: { xs: 2.5, md: 3 },
                    borderRadius: 3,
                    bgcolor: 'rgba(255,255,255,0.04)',
                    borderColor: 'rgba(255,255,255,0.12)'
                  }}
                >
                  <Typography sx={{ color: '#fff', fontWeight: 500, mb: 0.75, lineHeight: 1.5 }}>
                    {example.question}
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                    {example.via}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Typography variant="h6" sx={{ mb: 2.5 }}>
              Getting it connected
            </Typography>

            <Box
              sx={{
                p: 2,
                mb: 3,
                borderRadius: 2,
                bgcolor: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.12)'
              }}
            >
              <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', mb: 0.5 }}>
                MCP endpoint
              </Typography>
              <Typography
                component="code"
                sx={{
                  color: 'primary.light',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: '0.9rem',
                  wordBreak: 'break-all'
                }}
              >
                {MCP_ENDPOINT}
              </Typography>
            </Box>

            <Stack spacing={2.5} sx={{ mb: 4 }}>
              {CONNECT_STEPS.map((step) => (
                <Box key={step.title} sx={{ display: 'flex', gap: 1.5 }}>
                  <CheckCircleOutlined sx={{ color: 'primary.light', fontSize: 20, mt: 0.25, flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ fontWeight: 600, mb: 0.25 }}>{step.title}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.925rem', lineHeight: 1.65 }}>
                      {step.body}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Stack>

            <Box
              sx={{
                p: { xs: 2.5, md: 3 },
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)'
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                <InfoOutlined sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 18 }} />
                <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Where it stops</Typography>
              </Stack>
              <Stack spacing={1.25} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {ASSISTANT_LIMITS.map((limit) => (
                  <Typography
                    key={limit.body}
                    component="li"
                    sx={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.9rem', lineHeight: 1.65 }}
                  >
                    {limit.body}
                  </Typography>
                ))}
              </Stack>
            </Box>
          </Grid>
        </Grid>

        <Stack direction="row" spacing={1} sx={{ mt: { xs: 5, md: 7 }, flexWrap: 'wrap', gap: 1 }}>
          {[
            'Reads epochs and curves',
            'Reads per-class scores',
            'Looks at rendered frames',
            'Writes findings back',
            'Connects in one click',
            'Every call logged'
          ].map(
            (badge) => (
              <Chip
                key={badge}
                icon={<AutoAwesome sx={{ fontSize: 16 }} />}
                label={badge}
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  fontWeight: 500,
                  '& .MuiChip-icon': { color: 'primary.light' }
                }}
              />
            )
          )}
        </Stack>
      </Container>
    </Box>
  );
}
