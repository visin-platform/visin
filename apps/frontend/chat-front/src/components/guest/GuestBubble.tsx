import type { ReactNode } from 'react';
import { Avatar, Box } from '@mui/material';
import type { GuestCapabilities } from './useGuestCapabilities';

/** What the visitor said: on the right, in the brand colour, as in the signed-in chat. */
export function VisitorBubble({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        alignSelf: 'flex-end',
        maxWidth: '85%',
        px: 1.75,
        py: 1,
        borderRadius: '18px 18px 4px 18px',
        bgcolor: 'var(--chat-accent)',
        color: 'var(--chat-accent-ink)',
        overflowWrap: 'anywhere',
        whiteSpace: 'pre-wrap'
      }}
    >
      {children}
    </Box>
  );
}

/** What Vivi said: on the left beside her mark, on a quiet surface; amber when it is a refusal rather than an answer. */
export function ViviBubble({
  children,
  tone = 'plain',
  assistant
}: {
  children: ReactNode;
  tone?: 'plain' | 'warning';
  assistant?: GuestCapabilities['assistant'];
}) {
  return (
    <Box sx={{ alignSelf: 'flex-start', display: 'flex', gap: 1, maxWidth: '92%', alignItems: 'flex-start' }}>
      <Avatar
        src={assistant?.picture}
        slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
        sx={{ width: 28, height: 28, bgcolor: 'var(--chat-accent)', mt: 0.25 }}
        aria-hidden
      >
        {(assistant?.name || 'Vivi').charAt(0).toUpperCase()}
      </Avatar>
      <Box
        sx={(theme) => ({
          px: 1.75,
          py: 1,
          minWidth: 0,
          borderRadius: '18px 18px 18px 4px',
          bgcolor: tone === 'warning' ? theme.alpha(theme.palette.warning.main, 0.14) : 'action.hover',
          border: tone === 'warning' ? `1px solid ${theme.alpha(theme.palette.warning.main, 0.5)}` : 'none',
          overflowWrap: 'anywhere'
        })}
      >
        {children}
      </Box>
    </Box>
  );
}
