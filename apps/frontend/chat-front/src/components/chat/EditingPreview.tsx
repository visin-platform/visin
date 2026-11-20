import { Close } from '@mui/icons-material';
import { IconButton, Stack, Typography } from '@mui/material';

/** Above the box while a question is being reworded: what is being edited, and a way out. Sending asks again. */
export function EditingPreview({ onCancel }: { onCancel: () => void }) {
  return (
    <Stack direction="row" sx={{ px: 2, py: 1, gap: 1, bgcolor: 'action.hover', alignItems: 'center' }}>
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Editing your question
        </Typography>
        <Typography variant="body2" noWrap>
          Sending asks it again and replaces its answer.
        </Typography>
      </Stack>
      <IconButton aria-label="Cancel edit" onClick={onCancel}>
        <Close />
      </IconButton>
    </Stack>
  );
}
