import { Box, Container, Typography } from '@mui/material';
import { PhoneFrame } from './Frames';
import { PHONE_SCREENS } from '../content';
import { INK } from '../theme';

/** The installed app: three real phone screens and one line. */
export default function OnYourPhone() {
  return (
    <Box
      component="section"
      id="mobile"
      aria-labelledby="mobile-title"
      sx={{
        bgcolor: INK,
        color: '#fff',
        py: { xs: 9, md: 14 },
        overflow: 'hidden',
        backgroundImage: 'radial-gradient(700px 360px at 50% 110%, rgba(37,99,235,0.3), transparent 60%)'
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 8 } }}>
          <Typography id="mobile-title" variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.75rem' }, mb: 1.5 }}>
            Your runs, in your pocket
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: { md: '1.15rem' } }}>
            Install it from the browser. It opens like an app.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: { xs: 1.5, md: 4 }
          }}
        >
          {PHONE_SCREENS.map((screen, index) => (
            <PhoneFrame
              key={screen.src}
              src={screen.src}
              alt={screen.alt}
              sx={{
                width: { xs: '31%', md: 250 },
                maxWidth: 250,
                // The middle phone stands a step forward.
                transform: index === 1 ? { md: 'translateY(-28px)' } : undefined
              }}
            />
          ))}
        </Box>
      </Container>
    </Box>
  );
}
