import { ArrowBack } from '@mui/icons-material';
import { IconButton } from '@mui/material';

export function BackToConversations({ panel, onBack }: { panel: boolean; onBack: () => void }) {
  return (
    <IconButton
      aria-label="Conversation list"
      sx={{ display: panel ? 'inline-flex' : { xs: 'inline-flex', md: 'none' } }}
      onClick={onBack}
    >
      <ArrowBack />
    </IconButton>
  );
}
