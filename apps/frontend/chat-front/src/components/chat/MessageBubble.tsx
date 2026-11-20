import { Box, Chip, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useState } from 'react';
import { livePalette } from '@visin/frontend-core';
import { Markdown } from '@visin/frontend-core';
import type { Message } from '../../types/chat';
import { sourceLabel, sourceLinks } from '../../utils/sources';
import { MessageAttachments } from './MessageAttachments';
import { formatChatTime, formatChatDateTime } from '../../utils/regionalTime';
import { MessageActions, type MessageActionProps } from './MessageActions';
import { answerTrail } from '../../utils/thinking';
import { ThinkingFold } from './ThinkingTrail';
import { useLongPress } from '../../hooks/useLongPress';
import { bubbleText, bubbleWidth } from './bubbleStyle';
import { SenderLine } from './SenderLine';

const arrive = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ROUND = '18px';
const TUCKED = '6px';

export function MessageBubble({
  message,
  conversationId,
  own = false,
  first = true,
  last = true,
  profile,
  labels,
  fresh = false,
  canSave,
  onSave,
  onCopy,
  onReply,
  onSelectText,
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
  /** Opens a run of messages from one sender: it carries their name. */
  first?: boolean;
  /** Closes a run: it carries the time. */
  last?: boolean;
  profile?: { handle: string; picture?: string };
  /** Names for the runs an answer cites, where the conversation knows them. */
  labels?: { id: string; name: string }[];
  /** Arrived just now: it eases in. A thread that is opened shows what it has without it all moving. */
  fresh?: boolean;
  canSave: boolean;
  onSave: (message: Message) => void;
  onCopy: (body: string) => void;
  onReply: (message: Message) => void;
  onSelectText?: (text: string) => void;
}) {
  const system = message.kind === 'system';
  const unsent = Boolean(message.unsentAt);
  const answer = message.kind === 'assistant';
  const sources = answer ? sourceLinks(message) : [];
  const plain = system || unsent;
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const press = useLongPress(setMenu, !plain);
  const side = own ? 'Right' : 'Left';

  if (system) {
    return (
      <Box className="chat-message" data-message-id={message._id} sx={{ my: 1.5, textAlign: 'center', px: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {message.body} ·{' '}
          <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      className="chat-message"
      data-message-id={message._id}
      sx={{
        mt: first ? 'var(--chat-message-gap, 14px)' : '2px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: own ? 'flex-end' : 'flex-start',
        ...(fresh
          ? { animation: `${arrive} 180ms ease-out`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }
          : {})
      }}
    >
      {first && !own && <SenderLine name={message.senderName} profile={profile} />}
      <Box sx={{ position: 'relative', minWidth: 0, ...bubbleWidth(answer && !unsent) }}>
        <Box
          {...press}
          sx={(theme) => ({
            px: unsent ? 0.5 : 1.5,
            py: unsent ? 0.25 : 1,
            borderRadius: ROUND,
            ...(unsent ? {} : { [`borderTop${side}Radius`]: first ? ROUND : TUCKED, [`borderBottom${side}Radius`]: TUCKED }),
            border: unsent || own ? 0 : 1,
            borderColor: 'divider',
            bgcolor: unsent
              ? 'transparent'
              : own
                ? `var(--chat-accent, ${livePalette(theme).primary.main})`
                : `var(--chat-message-bg, ${livePalette(theme).background.paper})`,
            color: unsent
              ? 'text.secondary'
              : own
                ? `var(--chat-accent-ink, ${livePalette(theme).primary.contrastText})`
                : 'text.primary',
            overflowWrap: 'anywhere',
            // A long press is this bubble's menu, which has Copy and Select text. iOS would also start its own
            // selection under the same finger, and the two draw over each other. A mouse selects as usual.
            '@media (hover: none) and (pointer: coarse)': {
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none'
            },
            ...bubbleText
          })}
        >
          {!unsent && message.quote && (
            <Box
              component="blockquote"
              sx={{ m: 0, mb: 0.75, pl: 1, borderLeft: 2, borderColor: own ? 'currentColor' : 'divider', opacity: 0.85 }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {message.quote.senderName}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {message.quote.body}
              </Typography>
            </Box>
          )}
          {!unsent && message.attachments?.length && (conversationId || message.conversationId) ? (
            <MessageAttachments
              conversationId={(conversationId || message.conversationId)!}
              files={message.attachments}
            />
          ) : null}
          {unsent ? (
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              Message unsent
            </Typography>
          ) : answer ? (
            <>
              <ThinkingFold
                entries={answerTrail(message)}
                footer={
                  message.evidence.length > 0 && (
                    <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.75 }}>
                      Sources checked {formatChatDateTime(message.evidence[0].at)}
                    </Typography>
                  )
                }
              />
              <Markdown>{message.body}</Markdown>
            </>
          ) : (
            message.body && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</Typography>
          )}
          {!unsent && answer && sources.length > 0 && (
            <Stack direction="row" aria-label="Sources" sx={{ gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
              {sources.map((source) => (
                <Chip
                  key={source.key}
                  component="a"
                  href={source.href}
                  clickable
                  size="small"
                  label={sourceLabel(
                    source,
                    source.kind === 'run' ? labels?.find((label) => source.href.endsWith(`/${label.id}`))?.name : undefined
                  )}
                />
              ))}
            </Stack>
          )}
        </Box>
        <MessageActions
          message={message}
          own={own}
          userId={userId}
          onCopy={onCopy}
          onReply={onReply}
          onReact={onReact}
          onUnsend={onUnsend}
          onSave={canSave && answer ? onSave : undefined}
          onSelectText={onSelectText}
          menu={menu}
          onMenu={setMenu}
        />
      </Box>
      {/* An assistant's answer shows none, including any it was given before it stopped taking them. */}
      {!unsent && !answer && Boolean(message.reactions?.length) && (
        // Tucked over the bubble's lower edge, so the pills sit on the message they are for.
        <Stack
          direction="row"
          sx={{ gap: 0.5, mt: -0.75, mx: 1, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}
          aria-label="Message reaction counts"
        >
          {[...new Set(message.reactions?.map((reaction) => reaction.emoji))].map((emoji) => {
            const count = message.reactions!.filter((reaction) => reaction.emoji === emoji).length;
            const mine = message.reactions!.some((reaction) => reaction.emoji === emoji && reaction.userId === userId);
            return (
              <Chip
                key={emoji}
                label={count > 1 ? `${emoji} ${count}` : emoji}
                size="small"
                aria-label={`${emoji}: ${count} reaction${count === 1 ? '' : 's'}${mine ? ', including yours' : ''}`}
                onClick={onReact ? () => void onReact(message, mine ? null : emoji) : undefined}
                sx={(theme) => ({
                  height: 22,
                  bgcolor: `var(--chat-message-bg, ${livePalette(theme).background.paper})`,
                  border: 1,
                  borderColor: mine ? 'var(--chat-accent)' : 'divider',
                  '& .MuiChip-label': { px: 0.75 }
                })}
              />
            );
          })}
        </Stack>
      )}
      {(last || message.findingId) && (
        <Typography variant="caption" color="text.secondary" sx={{ mx: 1, mt: 0.25, fontSize: 11 }}>
          <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
          {!unsent && message.findingId && ' · Saved as finding'}
        </Typography>
      )}
    </Box>
  );
}
