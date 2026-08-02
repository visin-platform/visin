import { Box, Container, Grid, Link, Typography } from '@mui/material';
import ContactForm from '../ContactForm';
import GitHubIcon from './GitHubIcon';
import { GITHUB_URL } from '../content';

export default function Contact() {
  return (
    <Box component="section" id="contact" sx={{ py: { xs: 8, md: 12 }, bgcolor: '#f8fafc' }}>
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
              Deployment questions, a feature that doesn&apos;t fit your workflow, or interest in contributing — send
              a note and we&apos;ll reply by email.
            </Typography>
            <Link
              href={`${GITHUB_URL}/visin-monorepo/issues`}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontWeight: 600 }}
            >
              <GitHubIcon fontSize="small" />
              Found a bug? Open an issue
            </Link>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <ContactForm />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
