import { useEffect, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Check, ContentCopy } from '@mui/icons-material';

/** How long the check mark stays before the button goes back to "Copy". */
const COPIED_MS = 2000;

/**
 * A fenced code block with a copy button, which is what a reader wants from a LaTeX snippet or a command. The button
 * shows on hover and on focus (always, where there is no hover), and falls back quietly where the browser refuses the
 * clipboard: the text is still selectable.
 */
export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Box
      sx={{
        position: 'relative',
        my: 1.5,
        '& .code-copy': { opacity: 0, transition: 'opacity 120ms' },
        '&:hover .code-copy, & .code-copy:focus-visible, & .code-copy[data-copied="true"]': { opacity: 1 },
        '@media (hover: none)': { '& .code-copy': { opacity: 1 } }
      }}
    >
      <Box
        component="pre"
        tabIndex={0}
        sx={{
          m: 0,
          p: 1.5,
          pr: 5,
          overflowX: 'auto',
          borderRadius: 1,
          bgcolor: 'action.hover',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.875rem',
          lineHeight: 1.5
        }}
      >
        <code>{text}</code>
      </Box>
      <Tooltip title={copied ? 'Copied' : 'Copy code'}>
        <IconButton
          className="code-copy"
          data-copied={copied}
          size="small"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() => void copy()}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'background.paper' }
          }}
        >
          {copied ? <Check fontSize="inherit" color="success" /> : <ContentCopy fontSize="inherit" />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
