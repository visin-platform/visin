import { Close } from '@mui/icons-material';
import { IconButton, Stack, Typography } from '@mui/material';
import type { Message } from '../../types/chat';
/** The composer keeps the target explicit; the server supplies the persisted quote. */
export function ReplyPreview({
  message,
  onCancel,
  shared
}: {
  message: Message;
  onCancel: () => void;
  shared: boolean;
}) {
  return (
    <Stack direction="row" sx={{ px: 2, py: 1, gap: 1, bgcolor: 'action.hover', alignItems: 'center' }}>
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Replying to {message.senderName}
        </Typography>
        <Typography variant="body2" noWrap>
          {message.body}
        </Typography>
        {shared && message.kind === 'assistant' && (
          <Typography variant="caption">This reply asks the assistant for everyone in this conversation.</Typography>
        )}
      </Stack>
      <IconButton aria-label="Cancel reply" onClick={onCancel}>
        <Close />
      </IconButton>
    </Stack>
  );
}
