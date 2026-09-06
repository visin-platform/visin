import { Box, Container, Grid, Typography } from '@mui/material';
import ContactForm from '../ContactForm';

export default function Contact() {
  return (
    <Box component="section" id="contact" sx={{ py: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 4, md: 8 }} sx={{ alignItems: 'flex-start' }}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1.2 }}>
              Contact
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, mt: 1, mb: 2 }}>
              Questions about running it?
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '1.075rem', mb: 3 }}>
              Deployment questions, a missing feature, or interest in contributing. Send a note and
              we&apos;ll reply by email.
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <ContactForm />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
