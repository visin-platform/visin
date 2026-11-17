import { Typography } from '@mui/material';

/** What an empty analysis says: what can be asked, in a line. The question itself is the asker's. */
export function AnalysisHint() {
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mt: 4, px: 2 }}>
      Ask about results, validation peaks or your next experiment.
    </Typography>
  );
}
