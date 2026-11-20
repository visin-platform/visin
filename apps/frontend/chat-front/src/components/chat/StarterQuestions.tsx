import { Chip, Stack, Typography } from '@mui/material';
import { startersFor } from '../../utils/starters';

/** Questions that fit the page beside the chat, as chips: picking one asks it. Nothing is read to make them. */
export function StarterQuestions({
  path,
  disabled,
  onPick
}: {
  path: string;
  disabled?: boolean;
  onPick: (question: string) => void;
}) {
  return (
    <Stack aria-label="Example questions" role="group" sx={{ alignItems: 'center', gap: 1, mt: 2, px: 1 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Try asking
      </Typography>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', justifyContent: 'center' }}>
        {startersFor(path).map((starter) => (
          <Chip
            key={starter.question}
            label={starter.label}
            clickable
            disabled={disabled}
            onClick={() => onPick(starter.question)}
            variant="outlined"
            size="small"
          />
        ))}
      </Stack>
    </Stack>
  );
}
