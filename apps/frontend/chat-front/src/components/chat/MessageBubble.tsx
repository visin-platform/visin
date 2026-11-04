import { ContentCopy, Reply } from '@mui/icons-material';
import { Avatar, Box, Button, Chip, IconButton, Link, Stack, Tooltip, Typography } from '@mui/material';
import { Markdown } from '@visin/frontend-core';
import type { Message } from '../../types/chat';
import { evidenceLinks } from '../../utils/messages';

const actionSx = {
  color: 'text.secondary',
  width: { xs: 44, sm: 36 },
  height: { xs: 44, sm: 36 },
  '&:hover': { color: 'primary.main' }
};

export function MessageBubble({
  message,
  own = false,
  profile,
  canSave,
  onSave,
  onCopy,
  onReply
}: {
  message: Message;
  own?: boolean;
  profile?: { handle: string; picture?: string };
  canSave: boolean;
  onSave: (message: Message) => void;
  onCopy: (body: string) => void;
  onReply: (message: Message) => void;
}) {
  const system = message.kind === 'system';
  return (
    <Box
      sx={{
        mb: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: system ? 'center' : own ? 'flex-end' : 'flex-start'
      }}
    >
      {!own && !system && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5, px: 0.5 }}>
          {profile ? (
            <Link href={`/u/${encodeURIComponent(profile.handle)}`} aria-label={`View ${message.senderName} profile`}>
              <Avatar src={profile.picture} alt="" sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                {message.senderName.charAt(0)}
              </Avatar>
            </Link>
          ) : (
            <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>{message.senderName.charAt(0)}</Avatar>
          )}
          <Typography variant="caption" color="text.secondary">
            {message.senderName}
          </Typography>
        </Stack>
      )}
      <Box
        sx={{
          maxWidth: system ? '100%' : { xs: '92%', sm: '85%' },
          minWidth: 0,
          px: system ? 1 : 1.5,
          py: 1,
          borderRadius: 2.5,
          border: system ? 0 : 1,
          borderColor: own ? 'primary.main' : 'divider',
          bgcolor: system ? 'transparent' : own ? 'primary.main' : 'action.hover',
          color: system ? 'text.secondary' : own ? 'primary.contrastText' : 'text.primary',
          overflowWrap: 'anywhere',
          '& > :first-child': { mt: 0 },
          '& > :last-child': { mb: 0 }
        }}
      >
        {message.quote && (
          <Box component="blockquote" sx={{ m: 0, mt: 0.5, mb: 1, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {message.quote.senderName}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {message.quote.body}
            </Typography>
          </Box>
        )}
        {message.kind === 'assistant' ? (
          <Markdown>{message.body}</Markdown>
        ) : (
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</Typography>
        )}
        {message.kind === 'assistant' && (
          <Stack spacing={1}>
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
              {evidenceLinks(message).map((id) => (
                <Chip
                  key={id}
                  component="a"
                  href={`/trainings/${id}`}
                  clickable
                  size="small"
                  label={`Evidence · ${id.slice(-6)}`}
                />
              ))}
            </Stack>
            {message.evidence.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Sources checked {new Date(message.evidence[0].at).toLocaleString()}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      <Stack direction="row" sx={{ gap: 0.25, mt: 0.25, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.75 }}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
        <Tooltip title="Copy message" arrow>
          <IconButton
            size="small"
            aria-label="Copy"
            onClick={() => onCopy(message.body)}
            sx={actionSx}
          >
            <ContentCopy sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        {message.kind !== 'system' && (
          <Tooltip title="Reply to message" arrow>
            <IconButton
              size="small"
              aria-label={`Reply to ${message.senderName}`}
              onClick={() => onReply(message)}
              sx={actionSx}
            >
              <Reply sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
        {canSave && message.kind === 'assistant' && (
          <Button size="small" disabled={Boolean(message.findingId)} onClick={() => onSave(message)}>
            {message.findingId ? 'Saved as finding' : 'Save as finding'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
