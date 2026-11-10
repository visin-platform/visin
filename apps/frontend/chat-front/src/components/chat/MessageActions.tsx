import { AddReactionOutlined, ContentCopy, MoreHoriz, Reply, Undo } from '@mui/icons-material';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Tooltip
} from '@mui/material';
import { useState } from 'react';
import type { Message } from '../../types/chat';
import { chatChrome } from '../../appearance/chatAppearance';

const REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
export interface MessageActionProps {
  message: Message;
  own?: boolean;
  userId?: string;
  onCopy: (body: string) => void;
  onReply: (message: Message) => void;
  onReact?: (message: Message, emoji: string | null) => Promise<void>;
  onUnsend?: (message: Message) => Promise<void>;
}
/** Always reachable with touch or keyboard; pointer users see the toolbar on message hover. */
export function MessageActions({ message, own, userId, onCopy, onReply, onReact, onUnsend }: MessageActionProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [reactions, setReactions] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (message.unsentAt) return null;
  const text = message.body || message.attachments?.map((file) => file.name).join('\n') || '';
  const copy = () => {
    onCopy(text);
    setMenu(null);
  };
  const reply = () => {
    onReply(message);
    setMenu(null);
  };
  const buttonSx = {
    width: { xs: 44, sm: 34 },
    height: { xs: 44, sm: 34 },
    color: 'text.secondary',
    '&:hover': { color: 'var(--chat-accent)' }
  };
  return (
    <>
      <Stack
        className="message-actions"
        direction="row"
        role="group"
        aria-label={`Actions for ${message.senderName}’s message`}
        sx={(theme) => ({
          ...chatChrome(theme),
          border: 1,
          borderColor: 'divider',
          borderRadius: 6,
          alignItems: 'center',
          '@media (hover: hover) and (pointer: fine)': {
            opacity: 0,
            pointerEvents: 'none',
            '.chat-message:hover &, .chat-message:focus-within &': { opacity: 1, pointerEvents: 'auto' }
          }
        })}
      >
        {text && (
          <Tooltip title={message.body ? 'Copy message' : 'Copy file names'}>
            <IconButton aria-label="Copy" onClick={copy} sx={buttonSx}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {message.kind !== 'system' && (
          <Tooltip title="Reply">
            <IconButton aria-label={`Reply to ${message.senderName}`} onClick={reply} sx={buttonSx}>
              <Reply fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {onReact && message.kind !== 'system' && (
          <Tooltip title="React">
            <IconButton
              aria-label="React to message"
              aria-haspopup="dialog"
              aria-expanded={Boolean(reactions)}
              onClick={(event) => setReactions(event.currentTarget)}
              sx={buttonSx}
            >
              <AddReactionOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {message.kind !== 'system' && (
          <Tooltip title="Message actions">
            <IconButton
              aria-label="Message actions"
              aria-haspopup="menu"
              aria-expanded={Boolean(menu)}
              onClick={(event) => setMenu(event.currentTarget)}
              sx={buttonSx}
            >
              <MoreHoriz fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={reply}>
          <Reply fontSize="small" sx={{ mr: 1 }} />
          Reply
        </MenuItem>
        {text && (
          <MenuItem onClick={copy}>
            <ContentCopy fontSize="small" sx={{ mr: 1 }} />
            {message.body ? 'Copy text' : 'Copy file names'}
          </MenuItem>
        )}
        {own && onUnsend && message.kind === 'person' && (
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              setMenu(null);
              setConfirm(true);
            }}
          >
            <Undo fontSize="small" sx={{ mr: 1 }} />
            Unsend
          </MenuItem>
        )}
      </Menu>
      <Popover
        open={Boolean(reactions)}
        anchorEl={reactions}
        onClose={() => setReactions(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box
          role="dialog"
          aria-label="Message reactions"
          sx={{ display: 'flex', p: 0.5, flexWrap: 'wrap', maxWidth: 300 }}
        >
          {REACTIONS.map((emoji) => (
            <IconButton
              key={emoji}
              aria-label={`React ${emoji}`}
              aria-pressed={
                message.reactions?.some((reaction) => reaction.userId === userId && reaction.emoji === emoji) ?? false
              }
              disabled={busy}
              sx={{ width: 44, height: 44, fontSize: '1.5rem' }}
              onClick={() => {
                setBusy(true);
                void onReact?.(
                  message,
                  message.reactions?.some((reaction) => reaction.userId === userId && reaction.emoji === emoji)
                    ? null
                    : emoji
                ).finally(() => {
                  setBusy(false);
                  setReactions(null);
                });
              }}
            >
              {emoji}
            </IconButton>
          ))}
        </Box>
      </Popover>
      <Dialog
        open={confirm}
        onClose={busy ? undefined : () => setConfirm(false)}
        aria-labelledby={`unsend-${message._id}`}
      >
        <DialogTitle id={`unsend-${message._id}`}>Unsend message?</DialogTitle>
        <DialogContent>
          <DialogContentText>The message will be removed from this conversation for everyone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onUnsend?.(message).finally(() => {
                setBusy(false);
                setConfirm(false);
              });
            }}
          >
            Unsend
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
