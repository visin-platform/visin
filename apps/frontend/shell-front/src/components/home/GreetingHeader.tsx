import { Box, Typography } from '@mui/material';
import { firstNameOf, formatToday, greetingFor } from './formatting';

interface GreetingHeaderProps {
  name?: string;
  now: Date;
}

/**
 * The top of the home page, set the way a phone app titles a screen: the date
 * small above, the greeting large and left-aligned under it.
 */
export function GreetingHeader({ name, now }: GreetingHeaderProps) {
  const first = firstNameOf(name);

  return (
    <Box component="header">
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'primary.main',
          mb: 0.5
        }}
      >
        {formatToday(now)}
      </Typography>
      <Typography
        component="h1"
        sx={{ fontSize: { xs: '1.9rem', md: '2.5rem' }, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}
      >
        {first ? `${greetingFor(now)}, ${first}` : 'Welcome to Visin'}
      </Typography>
    </Box>
  );
}
