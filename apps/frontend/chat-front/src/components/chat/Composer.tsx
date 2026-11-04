import { InsertEmoticon, Send } from '@mui/icons-material';
import { Box, Button, IconButton, List, ListItemButton, Popover, Stack, TextField, Typography } from '@mui/material';
import { useId, useRef, useState, type RefObject } from 'react';
import { useAssistantMentions } from '../../hooks/useAssistantMentions';
import type { SharedAssistant } from '../../types/assistant';

interface ComposerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  hint?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  assistants?: SharedAssistant[];
  selectedAssistantId?: string;
  onMention?: (id: string) => void;
}

/** Enter accepts a visible mention suggestion; otherwise it sends. IME and Shift+Enter keep their usual behavior. */
export function Composer({
  label,
  value,
  onChange,
  onSend,
  disabled,
  sending,
  hint,
  inputRef,
  assistants = [],
  selectedAssistantId,
  onMention
}: ComposerProps) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef || localRef;
  const listId = useId();
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const emojiSelection = useRef({ start: 0, end: 0 });
  const emojis = [
    ['😀', 'Grinning face'],
    ['😊', 'Smiling face'],
    ['😂', 'Tears of joy'],
    ['🥰', 'Smiling with hearts'],
    ['😉', 'Wink'],
    ['🤔', 'Thinking'],
    ['😎', 'Cool'],
    ['😢', 'Sad'],
    ['👍', 'Thumbs up'],
    ['👎', 'Thumbs down'],
    ['👏', 'Clapping'],
    ['🙌', 'Raised hands'],
    ['❤️', 'Heart'],
    ['🎉', 'Celebration'],
    ['🔥', 'Fire'],
    ['✨', 'Sparkles'],
    ['✅', 'Check mark'],
    ['🙏', 'Thank you'],
    ['👋', 'Wave'],
    ['🚀', 'Rocket'],
    ['💡', 'Idea'],
    ['👀', 'Eyes'],
    ['💯', 'Hundred'],
    ['🤝', 'Handshake']
  ];
  const insertEmoji = (emoji: string) => {
    if (disabled || sending) return;
    const { start, end } = emojiSelection.current;
    if (value.length - (end - start) + emoji.length > 8000) return;
    onChange(value.slice(0, start) + emoji + value.slice(end));
    setEmojiAnchor(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  const mentions = useAssistantMentions(value, disabled || sending ? [] : assistants, selectedAssistantId, onMention);
  const pick = (bot: SharedAssistant) => {
    const next = mentions.select(bot);
    onChange(next.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
    });
  };
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ p: 1.5, alignItems: 'flex-start', borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !sending) onSend();
      }}
    >
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        {mentions.options.length > 0 && (
          <List id={listId} role="listbox" aria-label="Mention an assistant" dense disablePadding>
            {mentions.options.map((bot, index) => (
              <ListItemButton
                key={bot.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === mentions.active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(bot)}
              >
                @{bot.name}
              </ListItemButton>
            ))}
          </List>
        )}
        <TextField
          fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'action.hover' } }}
          multiline
          maxRows={6}
          size="small"
          label={label}
          value={value}
          inputRef={ref}
          onChange={(event) => {
            mentions.locate(event.target.selectionStart ?? event.target.value.length);
            onChange(event.target.value);
          }}
          onSelect={(event) => mentions.locate((event.target as HTMLTextAreaElement).selectionStart)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (mentions.options.length && ['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) {
              event.preventDefault();
              if (event.key === 'Escape') mentions.dismiss();
              else mentions.move(event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (mentions.options.length) pick(mentions.options[mentions.active]);
              else if (!disabled && !sending) onSend();
            }
          }}
          helperText={hint}
          disabled={disabled}
          slotProps={{
            htmlInput: {
              maxLength: 8000,
              'aria-controls': mentions.options.length ? listId : undefined,
              'aria-activedescendant': mentions.options.length ? `${listId}-${mentions.active}` : undefined,
              'aria-autocomplete': assistants.length ? 'list' : undefined
            }
          }}
        />
      </Stack>
      <IconButton
        aria-label="Choose emoji"
        disabled={disabled || sending}
        aria-haspopup="dialog"
        aria-expanded={!!emojiAnchor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          emojiSelection.current = {
            start: ref.current?.selectionStart ?? value.length,
            end: ref.current?.selectionEnd ?? value.length
          };
          setEmojiAnchor(event.currentTarget);
        }}
      >
        <InsertEmoticon fontSize="small" />
      </IconButton>
      <Popover
        open={!!emojiAnchor && !disabled && !sending}
        anchorEl={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Box role="dialog" aria-label="Emoji picker" sx={{ p: 1.5, width: 272 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Emoji
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {emojis.map(([emoji, name]) => (
              <IconButton
                key={name}
                aria-label={name}
                title={name}
                onClick={() => insertEmoji(emoji)}
                sx={{ fontSize: '1.4rem' }}
              >
                {emoji}
              </IconButton>
            ))}
          </Box>
        </Box>
      </Popover>
      <Button
        type="submit"
        variant="contained"
        aria-label="Send message"
        disabled={disabled || sending || !value.trim()}
        sx={{ minWidth: 40, width: 40, p: 0, height: 40, borderRadius: '50%' }}
      >
        <Send fontSize="small" />
      </Button>
    </Stack>
  );
}
