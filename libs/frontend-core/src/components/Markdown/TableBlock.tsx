import { useEffect, useState, type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Check, ContentCopy } from '@mui/icons-material';

/** How long the check mark stays before the button goes back to "Copy table". */
const COPIED_MS = 2000;

/**
 * A table that scrolls sideways when it is wider than its place, with a button that copies it as cells for a
 * spreadsheet. Like a code block's button it shows on hover and on focus (always, where there is no hover), and
 * falls back quietly where the browser refuses the clipboard: the table is still selectable.
 */
export function TableBlock({ text, children }: { text: string; children: ReactNode }) {
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
        '& .table-copy': { opacity: 0, transition: 'opacity 120ms' },
        '&:hover .table-copy, & .table-copy:focus-visible, & .table-copy[data-copied="true"]': { opacity: 1 },
        '@media (hover: none)': { '& .table-copy': { opacity: 1 } }
      }}
    >
      <Box sx={{ overflowX: 'auto' }}>{children}</Box>
      <Tooltip title={copied ? 'Copied' : 'Copy table'}>
        <IconButton
          className="table-copy"
          data-copied={copied}
          size="small"
          aria-label={copied ? 'Copied' : 'Copy table'}
          onClick={() => void copy()}
          sx={{
            position: 'absolute',
            top: -4,
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
