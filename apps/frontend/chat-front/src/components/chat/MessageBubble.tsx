import { CheckCircleOutlined, ExpandLess, ExpandMore } from '@mui/icons-material';
import { Avatar, Box, Button, Chip, Collapse, Link, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useState } from 'react';
import { livePalette } from '@visin/frontend-core';
import { Markdown } from '@visin/frontend-core';
import type { Message } from '../../types/chat';
import { evidenceLinks } from '../../utils/messages';
import { MessageAttachments } from './MessageAttachments';
import { formatChatTime, formatChatDateTime } from '../../utils/regionalTime';
import { MessageActions, type MessageActionProps } from './MessageActions';
import { toolLabel } from '../../utils/toolLabels';

const arrive = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;

export function MessageBubble({
  message,
  conversationId,
  own = false,
  profile,
  labels,
  fresh = false,
  canSave,
  onSave,
  onCopy,
  onReply,
  userId,
  onReact,
  onUnsend
}: {
  userId?: string;
  onReact?: MessageActionProps['onReact'];
  onUnsend?: MessageActionProps['onUnsend'];
  message: Message;
  conversationId?: string;
  own?: boolean;
  profile?: { handle: string; picture?: string };
  /** Names for the runs an answer cites, where the conversation knows them. */
  labels?: { id: string; name: string }[];
  /** Arrived just now: it eases in. A thread that is opened shows what it has without it all moving. */
  fresh?: boolean;
  canSave: boolean;
  onSave: (message: Message) => void;
  onCopy: (body: string) => void;
  onReply: (message: Message) => void;
}) {
  const system = message.kind === 'system';
  const [showSources, setShowSources] = useState(false);
  return (
    <Box
      className="chat-message"
      data-message-id={message._id}
      sx={{
        mb: 'var(--chat-message-gap, 10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: system ? 'center' : own ? 'flex-end' : 'flex-start',
        ...(fresh
          ? { animation: `${arrive} 180ms ease-out`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }
          : {})
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
        sx={(theme) => ({
          maxWidth: system ? '100%' : { xs: '96%', sm: '90%' },
          minWidth: 0,
          px: system ? 1 : 1.5,
          py: 'var(--chat-bubble-y, 6px)',
          borderRadius: 3,
          ...(system ? {} : own ? { borderBottomRightRadius: 0.75 } : { borderBottomLeftRadius: 0.75 }),
          boxShadow: system || message.unsentAt ? 'none' : '0 2px 10px var(--chat-message-shadow, transparent)',
          border: system || message.unsentAt ? 0 : 1,
          borderColor: own ? `var(--chat-accent, ${livePalette(theme).primary.main})` : 'divider',
          bgcolor:
            system || message.unsentAt
              ? 'transparent'
              : own
                ? `var(--chat-accent, ${livePalette(theme).primary.main})`
                : `var(--chat-message-bg, ${livePalette(theme).background.paper})`,
          color:
            system || message.unsentAt
              ? 'text.secondary'
              : own
                ? `var(--chat-accent-ink, ${livePalette(theme).primary.contrastText})`
                : 'text.primary',
          overflowWrap: 'anywhere',
          '& > :first-child': { mt: 0 },
          '& > :last-child': { mb: 0 }
        })}
      >
        {!message.unsentAt && message.quote && (
          <Box component="blockquote" sx={{ m: 0, mt: 0.5, mb: 1, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {message.quote.senderName}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {message.quote.body}
            </Typography>
          </Box>
        )}
        {!message.unsentAt && message.attachments?.length && (conversationId || message.conversationId) ? (
          <MessageAttachments
            conversationId={(conversationId || message.conversationId)!}
            files={message.attachments}
          />
        ) : null}
        {message.unsentAt ? (
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            Message unsent
          </Typography>
        ) : message.kind === 'assistant' ? (
          <Markdown>{message.body}</Markdown>
        ) : (
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</Typography>
        )}
        {!message.unsentAt && message.kind === 'assistant' && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
              {evidenceLinks(message).map((id) => (
                <Chip
                  key={id}
                  component="a"
                  href={`/trainings/${id}`}
                  clickable
                  size="small"
                  label={labels?.find((label) => label.id === id)?.name || `Run ${id.slice(-6)}`}
                />
              ))}
            </Stack>
            {message.evidence.length > 0 && (
              <Box>
                <Button
                  size="small"
                  color="inherit"
                  aria-expanded={showSources}
                  startIcon={<CheckCircleOutlined fontSize="small" />}
                  endIcon={showSources ? <ExpandLess /> : <ExpandMore />}
                  onClick={() => setShowSources((open) => !open)}
                  sx={{ color: 'text.secondary', textTransform: 'none', px: 0.5 }}
                >
                  Checked {message.evidence.length} {message.evidence.length === 1 ? 'source' : 'sources'}
                </Button>
                <Collapse in={showSources} unmountOnExit>
                  <Stack component="ul" spacing={0.25} sx={{ m: 0, mt: 0.5, pl: 3 }}>
                    {message.evidence.map((entry, index) => (
                      <Typography
                        component="li"
                        variant="caption"
                        key={`${entry.tool}-${index}`}
                        color="text.secondary"
                      >
                        {toolLabel(entry.tool, 'done')}
                      </Typography>
                    ))}
                    <Typography
                      component="li"
                      variant="caption"
                      color="text.secondary"
                      sx={{ listStyle: 'none', ml: -3, mt: 0.5 }}
                    >
                      Sources checked {formatChatDateTime(message.evidence[0].at)}
                    </Typography>
                  </Stack>
                </Collapse>
              </Box>
            )}
          </Stack>
        )}
      </Box>
      {!message.unsentAt && Boolean(message.reactions?.length) && (
        <Stack direction="row" sx={{ gap: 0.5, mt: 0.5, flexWrap: 'wrap' }} aria-label="Message reaction counts">
          {[...new Set(message.reactions?.map((reaction) => reaction.emoji))].map((emoji) => {
            const count = message.reactions!.filter((reaction) => reaction.emoji === emoji).length;
            const mine = message.reactions!.some((reaction) => reaction.emoji === emoji && reaction.userId === userId);
            return (
              <Chip
                key={emoji}
                label={`${emoji} ${count}`}
                size="small"
                variant={mine ? 'filled' : 'outlined'}
                aria-label={`${emoji}: ${count} reaction${count === 1 ? '' : 's'}${mine ? ', including yours' : ''}`}
                onClick={onReact ? () => void onReact(message, mine ? null : emoji) : undefined}
              />
            );
          })}
        </Stack>
      )}
      <Stack direction="row" sx={{ gap: 0.25, mt: 0.25, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography
          component="time"
          dateTime={message.createdAt}
          variant="caption"
          color="text.secondary"
          sx={{ px: 0.75 }}
        >
          {formatChatTime(message.createdAt)}
        </Typography>
        <MessageActions
          message={message}
          own={own}
          userId={userId}
          onCopy={onCopy}
          onReply={onReply}
          onReact={onReact}
          onUnsend={onUnsend}
        />
        {!message.unsentAt && canSave && message.kind === 'assistant' && (
          <Button size="small" disabled={Boolean(message.findingId)} onClick={() => onSave(message)}>
            {message.findingId ? 'Saved as finding' : 'Save as finding'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
