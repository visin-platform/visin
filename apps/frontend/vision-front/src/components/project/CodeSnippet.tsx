import React, { useState } from 'react';
import { Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { ContentCopy as ContentCopyIcon, Check as CheckIcon } from '@mui/icons-material';

interface CodeSnippetProps {
  code: string;
  /** what the copy button copies, for its accessible name */
  label: string;
}

/** A block of code to paste somewhere else, with a copy button. */
const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, label }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Selectable on screen either way.
    }
  };

  return (
    <Paper variant="outlined" sx={{ position: 'relative', bgcolor: 'background.default', borderRadius: 2 }}>
      <Box sx={{ overflowX: 'auto', p: 2, pr: 6 }}>
        <Typography component="pre" variant="body2" sx={{ fontFamily: 'monospace', m: 0, whiteSpace: 'pre' }}>
          {code}
        </Typography>
      </Box>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton onClick={copy} aria-label={`Copy ${label}`} size="small" sx={{ position: 'absolute', top: 8, right: 8 }}>
          {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Paper>
  );
};

export default CodeSnippet;
