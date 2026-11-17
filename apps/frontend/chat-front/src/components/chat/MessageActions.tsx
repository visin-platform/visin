import {
  AddReactionOutlined,
  BookmarkAddOutlined,
  BookmarkAdded,
  ContentCopy,
  MoreHoriz,
  Reply,
  SelectAll,
  Undo
} from '@mui/icons-material';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Tooltip
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import type { Message } from '../../types/chat';

const REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
const FINE_POINTER = '@media (hover: hover) and (pointer: fine)';
const TOUCH = '@media (hover: none), (pointer: coarse)';
/** A menu entry a mouse already has as an icon beside the bubble, or (Select text) has no need of. */
const besideOnly = { [FINE_POINTER]: { display: 'none' } };

export interface MessageActionProps {
  message: Message;
  own?: boolean;
  userId?: string;
  onCopy: (body: string) => void;
  onReply: (message: Message) => void;
  onReact?: (message: Message, emoji: string | null) => Promise<void>;
  onUnsend?: (message: Message) => Promise<void>;
  /** Offered on an analyst's answer in a project's analysis. */
  onSave?: (message: Message) => void;
  /** Opens the text where a phone can select part of it: a long press is the menu, not the browser's selection. */
  onSelectText?: (text: string) => void;
  /** The menu's anchor, when the bubble opens it with a long press. Left out, the menu keeps its own. */
  menu?: HTMLElement | null;
  onMenu?: (anchor: HTMLElement | null) => void;
}

/**
 * Reply, React and More beside the bubble while a mouse is over the message; Copy, Save as finding and Unsend are in
 * More. A touch screen has no hover: a long press on the bubble opens the same menu, with the reactions and Reply
 * added. The icons stay in the page for a keyboard or a screen reader, and show when they have focus.
 */
export function MessageActions({
  message,
  own,
  userId,
  onCopy,
  onReply,
  onReact,
  onUnsend,
  onSave,
  onSelectText,
  menu: controlledMenu,
  onMenu
}: MessageActionProps) {
  const [ownMenu, setOwnMenu] = useState<HTMLElement | null>(null);
  const menu = controlledMenu !== undefined ? controlledMenu : ownMenu;
  const setMenu = onMenu ?? setOwnMenu;
  const [reactions, setReactions] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (message.unsentAt || message.kind === 'system') return null;
  const answer = message.kind === 'assistant';
  const saved = Boolean(message.findingId);
  const text = message.body || message.attachments?.map((file) => file.name).join('\n') || '';
  const mine = (emoji: string) =>
    message.reactions?.some((reaction) => reaction.userId === userId && reaction.emoji === emoji) ?? false;
  const close = (then?: () => void) => () => {
    setMenu(null);
    then?.();
  };
  const react = (emoji: string, done: () => void) => {
    setBusy(true);
    void onReact?.(message, mine(emoji) ? null : emoji).finally(() => {
      setBusy(false);
      done();
    });
  };
  const icon = (
    label: string,
    title: string,
    child: ReactNode,
    onClick: (anchor: HTMLElement) => void,
    extra: Record<string, unknown> = {}
  ) => (
    <Tooltip title={title}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={(event) => onClick(event.currentTarget)}
        sx={{ width: 32, height: 32, color: 'text.secondary', '&:hover': { color: 'var(--chat-accent)' } }}
        {...extra}
      >
        {child}
      </IconButton>
    </Tooltip>
  );
  const reactionButtons = (done: () => void) =>
    REACTIONS.map((emoji) => (
      <IconButton
        key={emoji}
        aria-label={`React ${emoji}`}
        aria-pressed={mine(emoji)}
        disabled={busy}
        sx={{ width: 44, height: 44, fontSize: '1.5rem' }}
        onClick={() => react(emoji, done)}
      >
        {emoji}
      </IconButton>
    ));

  return (
    <>
      <Stack
        className="message-actions"
        direction={own ? 'row-reverse' : 'row'}
        role="group"
        aria-label={`Actions for ${message.senderName}’s message`}
        sx={{
          position: 'absolute',
          bottom: 0,
          alignItems: 'center',
          ...(own ? { right: '100%', mr: 0.25 } : { left: '100%', ml: 0.25 }),
          [FINE_POINTER]: {
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity .12s ease',
            '.chat-message:hover &, .chat-message:focus-within &': { opacity: 1, pointerEvents: 'auto' }
          },
          // No hover here: out of sight until a keyboard or screen reader reaches it, then under the bubble.
          [TOUCH]: {
            '&:not(:focus-within)': {
              // Strings: a bare 1 in sx is 100%.
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              clipPath: 'inset(50%)',
              whiteSpace: 'nowrap'
            },
            '&:focus-within': { position: 'static', mt: 0.5 }
          }
        }}
      >
        {icon(`Reply to ${message.senderName}`, 'Reply', <Reply fontSize="small" />, () => onReply(message))}
        {onReact &&
          icon('React to message', 'React', <AddReactionOutlined fontSize="small" />, setReactions, {
            'aria-haspopup': 'dialog',
            'aria-expanded': Boolean(reactions)
          })}
        {icon('Message actions', 'More', <MoreHoriz fontSize="small" />, setMenu, {
          'aria-haspopup': 'menu',
          'aria-expanded': Boolean(menu)
        })}
      </Stack>
      {/* The whole list is for a long press. With a mouse, what already sits beside the bubble is left out of it. */}
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={close()}>
        {onReact && (
          <Box
            role="group"
            aria-label="Quick reactions"
            sx={{ display: 'flex', px: 0.5, pb: 0.5, ...besideOnly }}
          >
            {reactionButtons(close())}
          </Box>
        )}
        {onReact && <Divider sx={besideOnly} />}
        <MenuItem onClick={close(() => onReply(message))} sx={besideOnly}>
          <Reply fontSize="small" sx={{ mr: 1 }} />
          Reply
        </MenuItem>
        {text && (
          <MenuItem onClick={close(() => onCopy(text))}>
            <ContentCopy fontSize="small" sx={{ mr: 1 }} />
            {message.body ? 'Copy text' : 'Copy file names'}
          </MenuItem>
        )}
        {message.body && onSelectText && (
          <MenuItem onClick={close(() => onSelectText(message.body))} sx={besideOnly}>
            <SelectAll fontSize="small" sx={{ mr: 1 }} />
            Select text
          </MenuItem>
        )}
        {answer && onSave && (
          <MenuItem disabled={saved} onClick={close(() => onSave(message))}>
            {saved ? <BookmarkAdded fontSize="small" sx={{ mr: 1 }} /> : <BookmarkAddOutlined fontSize="small" sx={{ mr: 1 }} />}
            {saved ? 'Saved as finding' : 'Save as finding'}
          </MenuItem>
        )}
        {own && onUnsend && message.kind === 'person' && (
          <MenuItem sx={{ color: 'error.main' }} onClick={close(() => setConfirm(true))}>
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
        <Box role="dialog" aria-label="Message reactions" sx={{ display: 'flex', p: 0.5, flexWrap: 'wrap', maxWidth: 300 }}>
          {reactionButtons(() => setReactions(null))}
        </Box>
      </Popover>
      <Dialog open={confirm} onClose={busy ? undefined : () => setConfirm(false)} aria-labelledby={`unsend-${message._id}`}>
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
