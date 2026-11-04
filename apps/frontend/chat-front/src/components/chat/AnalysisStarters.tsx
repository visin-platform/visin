import { AutoAwesome } from '@mui/icons-material';
import { Button, Stack, Typography } from '@mui/material';
import type { PageContext } from '../../types/chat';
import { starters } from '../../utils/chatContext';

export function AnalysisStarters({ context, onAsk }: { context?: PageContext; onAsk: (text: string) => void }) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Typography sx={{ color: 'text.secondary' }}>
        Ask about results, validation peaks or your next experiment.
      </Typography>
      {starters(context).map((text) => (
        <Button key={text} size="small" variant="outlined" startIcon={<AutoAwesome />} onClick={() => onAsk(text)}>
          {text}
        </Button>
      ))}
    </Stack>
  );
}
