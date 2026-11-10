import { AutoAwesome } from '@mui/icons-material';
import { Chip, Stack } from '@mui/material';

/** Next questions, one click each, under the analyst's latest answer. */
export function FollowUps({ questions, onAsk }: { questions: string[]; onAsk: (text: string) => void }) {
  if (questions.length === 0) return null;
  return (
    <Stack
      direction="row"
      role="group"
      aria-label="Follow-up questions"
      sx={{ gap: 0.75, flexWrap: 'wrap', mt: -1, mb: 2 }}
    >
      {questions.map((text) => (
        <Chip
          key={text}
          size="small"
          variant="outlined"
          clickable
          icon={<AutoAwesome />}
          label={text}
          sx={{
            bgcolor: 'var(--chat-tint)',
            borderColor: 'divider',
            '&:hover': { bgcolor: 'var(--chat-tint)', borderColor: 'var(--chat-accent)' }
          }}
          onClick={() => onAsk(text)}
        />
      ))}
    </Stack>
  );
}
