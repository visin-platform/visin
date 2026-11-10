import { chatChrome } from '../../appearance/chatAppearance';
import { InsertEmoticon, Mic, Send, Stop } from '@mui/icons-material';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useAssistantMentions } from '../../hooks/useAssistantMentions';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import type { SharedAssistant } from '../../types/assistant';

const listening = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

interface ComposerProps {
  leading?: ReactNode;
  trailing?: ReactNode;
  hasAttachments?: boolean;
  dictation?: boolean;
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
  /** Offers `/summarize` and the like: short commands that write a whole question. For the analyst's threads. */
  commands?: boolean;
  /** An answer is being written. Stop replaces Send, and Esc does the same. Absent where it cannot be stopped. */
  onStop?: () => void;
}

/** Enter accepts a visible mention suggestion; otherwise it sends. IME and Shift+Enter keep their usual behavior. */
export function Composer({
  leading,
  trailing,
  hasAttachments = false,
  dictation = true,
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
  onMention,
  commands = false,
  onStop
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
    speech.stop();
    onChange(value.slice(0, start) + emoji + value.slice(end));
    setEmojiAnchor(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  const mentions = useAssistantMentions(value, disabled || sending ? [] : assistants, selectedAssistantId, onMention);
  const slash = useSlashCommands(value, commands && !disabled && !sending);
  const speech = useSpeechInput({ value, onChange, disabled: disabled || sending || !dictation });
  const apply = (text: string) => {
    speech.stop();
    onChange(text);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(text.length, text.length);
    });
  };
  const pick = (bot: SharedAssistant) => {
    speech.stop();
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
      sx={(theme) => ({ ...chatChrome(theme), p: 1.5, alignItems: 'flex-start', borderTop: 1, borderColor: 'divider' })}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        speech.stop();
        if (!disabled && !sending) onSend();
      }}
    >
      {leading}
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        {slash.options.length > 0 && (
          // One line each, and never taller than a few: this sits above the box, and the conversation needs the room.
          <List
            id={listId}
            role="listbox"
            aria-label="Commands"
            dense
            disablePadding
            sx={{ maxHeight: 148, overflowY: 'auto', mb: 0.5 }}
          >
            {slash.options.map((command, index) => (
              <ListItemButton
                key={command.name}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === slash.active}
                selected={index === slash.active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(command.text)}
              >
                <ListItemText
                  primary={
                    <>
                      <Box component="span" sx={{ fontWeight: 600 }}>{`/${command.name}`}</Box>
                      <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>
                        {command.hint}
                      </Box>
                    </>
                  }
                  sx={{ m: 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
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
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'action.hover' },
            ...(!speech.problem && !speech.listening
              ? { '& .MuiFormHelperText-root': { display: { xs: 'none', sm: 'block' } } }
              : {})
          }}
          multiline
          maxRows={6}
          size="small"
          label={label}
          value={value}
          inputRef={ref}
          onChange={(event) => {
            // Typing takes over from dictation, which would otherwise write over it.
            speech.stop();
            mentions.locate(event.target.selectionStart ?? event.target.value.length);
            slash.reset();
            onChange(event.target.value);
          }}
          onSelect={(event) => mentions.locate((event.target as HTMLTextAreaElement).selectionStart)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (
              slash.options.length &&
              ['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'Tab'].includes(event.key) &&
              !event.shiftKey
            ) {
              event.preventDefault();
              if (event.key === 'Escape') slash.dismiss();
              else if (event.key === 'Enter' || event.key === 'Tab') apply(slash.chosen!.text);
              else slash.move(event.key === 'ArrowDown' ? 1 : -1);
              return;
            }
            if (event.key === 'Escape' && onStop && !mentions.options.length) {
              event.preventDefault();
              onStop();
              return;
            }
            if (mentions.options.length && ['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) {
              event.preventDefault();
              if (event.key === 'Escape') mentions.dismiss();
              else mentions.move(event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (mentions.options.length) pick(mentions.options[mentions.active]);
              else if (!disabled && !sending) {
                speech.stop();
                onSend();
              }
            }
          }}
          error={Boolean(speech.problem)}
          helperText={speech.problem || (speech.listening ? 'Listening… press the microphone to stop' : hint)}
          disabled={disabled}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
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
                </InputAdornment>
              )
            },
            htmlInput: {
              maxLength: 8000,
              'aria-controls': slash.options.length || mentions.options.length ? listId : undefined,
              'aria-activedescendant': slash.options.length
                ? `${listId}-${slash.active}`
                : mentions.options.length
                  ? `${listId}-${mentions.active}`
                  : undefined,
              'aria-autocomplete': assistants.length || commands ? 'list' : undefined
            }
          }}
        />
      </Stack>
      {trailing}
      {dictation && speech.supported && (
        <Tooltip
          title={
            speech.listening
              ? 'Stop dictating'
              : 'Dictate. Your browser’s speech service listens; in Chrome the audio goes to Google, not to Visin.'
          }
          arrow
        >
          <span>
            <IconButton
              aria-label={speech.listening ? 'Stop dictating' : 'Dictate'}
              aria-pressed={speech.listening}
              disabled={disabled || sending}
              onMouseDown={(event) => event.preventDefault()}
              onClick={speech.toggle}
              color={speech.listening ? 'error' : 'default'}
            >
              <Mic
                fontSize="small"
                sx={
                  speech.listening
                    ? {
                        animation: `${listening} 1.2s ease-in-out infinite`,
                        '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
                      }
                    : undefined
                }
              />
            </IconButton>
          </span>
        </Tooltip>
      )}
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
      {onStop ? (
        <IconButton
          aria-label="Stop the analyst"
          onClick={onStop}
          sx={{ width: 40, height: 40, bgcolor: 'action.selected', '&:hover': { bgcolor: 'action.focus' } }}
        >
          <Stop fontSize="small" />
        </IconButton>
      ) : (
        <Button
          type="submit"
          variant="contained"
          aria-label="Send message"
          disabled={disabled || sending || (!value.trim() && !hasAttachments)}
          sx={{ minWidth: 40, width: 40, p: 0, height: 40, borderRadius: '50%' }}
        >
          <Send fontSize="small" />
        </Button>
      )}
    </Stack>
  );
}
