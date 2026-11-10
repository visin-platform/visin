import { Close } from '@mui/icons-material';
import { IconButton, Stack, Typography } from '@mui/material';
import type { Message } from '../../types/chat';
/** The composer keeps the target explicit; the server supplies the persisted quote. */
export function ReplyPreview({ message, onCancel }: { message: Message; onCancel: () => void }) {
  return (
    <Stack direction="row" sx={{ px: 2, py: 1, gap: 1, bgcolor: 'action.hover', alignItems: 'center' }}>
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Replying to {message.senderName}
        </Typography>
        <Typography variant="body2" noWrap>
          {message.unsentAt
            ? 'Message unsent'
            : message.body || message.attachments?.map((file) => file.name).join(', ')}
        </Typography>
      </Stack>
      <IconButton aria-label="Cancel reply" onClick={onCancel}>
        <Close />
      </IconButton>
    </Stack>
  );
}
