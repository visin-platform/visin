import { Box, Container, Grid, Typography } from '@mui/material';
import { STEPS } from '../content';

export default function Workflow() {
  return (
    <Box component="section" id="how-it-works" sx={{ py: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 680, mb: { xs: 5, md: 8 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1.2 }}>
            How it works
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, mt: 1, mb: 2 }}>
            From raw images to a table in your paper
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '1.075rem' }}>
            Start wherever you like. Nothing makes you use the whole thing.
          </Typography>
        </Box>

        <Grid container spacing={{ xs: 3, md: 4 }}>
          {STEPS.map((step, index) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }} key={step.title}>
              <Box
                sx={{
                  height: '100%',
                  pt: 3,
                  borderTop: '3px solid',
                  borderColor: index === 0 ? 'primary.main' : 'divider'
                }}
              >
                <Typography
                  sx={{ fontVariantNumeric: 'tabular-nums', color: 'primary.main', fontWeight: 700, mb: 1 }}
                >
                  {String(index + 1).padStart(2, '0')}
                </Typography>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {step.title}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.7 }}>
                  {step.body}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
