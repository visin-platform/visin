import type { ReactNode } from 'react';
import { Box, Container, Grid, Paper, Typography } from '@mui/material';
import {
  Storage,
  Brush,
  ModelTraining,
  CompareArrows,
  Groups,
  Key,
  AutoAwesome
} from '@mui/icons-material';
import { FEATURES, type Feature } from '../content';

const ICONS: Record<Feature['icon'], ReactNode> = {
  datasets: <Storage />,
  labeling: <Brush />,
  training: <ModelTraining />,
  compare: <CompareArrows />,
  teams: <Groups />,
  api: <Key />,
  assistant: <AutoAwesome />
};

export default function Features() {
  return (
    <Box component="section" id="features" sx={{ py: { xs: 8, md: 12 }, bgcolor: '#f8fafc' }}>
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 680, mb: { xs: 5, md: 8 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1.2 }}>
            Features
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, mt: 1, mb: 2 }}>
            The boring parts, handled
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '1.075rem' }}>
            No model zoo. No AutoML. No hosted GPUs. Visin does the bookkeeping and leaves your training
            code alone.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {FEATURES.map((feature) => (
            <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={feature.title}>
              <Paper
                variant="outlined"
                sx={{
                  height: '100%',
                  p: { xs: 3, md: 4 },
                  borderRadius: 3,
                  borderColor: 'divider',
                  transition: 'border-color 0.2s, transform 0.2s',
                  '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)' }
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(37,99,235,0.08)',
                    color: 'primary.main',
                    mb: 2.5
                  }}
                >
                  {ICONS[feature.icon]}
                </Box>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {feature.title}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.7 }}>
                  {feature.body}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
