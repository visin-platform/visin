import { Button, Stack, TextField } from '@mui/material';
import { Send } from '@mui/icons-material';
import type { RefObject } from 'react';

interface ComposerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  hint?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

/** The message box. Enter sends, Shift+Enter starts a new line; an IME composition keeps its Enter. */
export function Composer({ label, value, onChange, onSend, disabled, sending, hint, inputRef }: ComposerProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ p: 2, pt: 1, alignItems: 'flex-start' }}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <TextField
        fullWidth
        multiline
        maxRows={6}
        size="small"
        label={label}
        value={value}
        inputRef={inputRef}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!sending) onSend();
          }
        }}
        helperText={hint}
        disabled={disabled}
        slotProps={{ htmlInput: { maxLength: 8000 } }}
      />
      <Button
        type="submit"
        variant="contained"
        aria-label="Send message"
        disabled={disabled || sending || !value.trim()}
        sx={{ minWidth: 0, px: 1.5, height: 40 }}
      >
        <Send fontSize="small" />
      </Button>
    </Stack>
  );
}
