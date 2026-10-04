import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, Container, Typography, useMediaQuery } from '@mui/material';
import { useConfig } from '../config/ConfigProvider';
import RecordedLeaderboardPreview from './RecordedLeaderboardPreview';

function Preview() {
  const config = useConfig();
  const phone = useMediaQuery('(max-width: 700px)');
  return <Box component="section" id="leaderboards" aria-labelledby="leaderboards-heading" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
    <Container maxWidth="lg">
      <Typography variant="overline" color="primary">Leaderboard</Typography>
      <Typography id="leaderboards-heading" variant="h2" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mb: 1 }}>See which model holds up</Typography>
      {config.VISION_API_URL ? <RecordedLeaderboardPreview apiUrl={config.VISION_API_URL} appUrl={config.SHELL_FRONT_URL} phone={phone} /> : <Typography color="text.secondary">The leaderboard is not available right now</Typography>}
    </Container>
  </Box>;
}

export default function LeaderboardPreview() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } }));
  return <QueryClientProvider client={client}><Preview /></QueryClientProvider>;
}
