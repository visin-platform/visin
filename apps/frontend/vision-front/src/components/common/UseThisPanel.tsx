import React, { useState } from 'react';
import { Box, ButtonBase, Collapse, Paper, Typography } from '@mui/material';
import { Code as CodeIcon, ExpandMore as ExpandIcon } from '@mui/icons-material';
import type { Snippet } from '../../utils/useSnippets';
import { SnippetList } from './UseThisDialog';

interface UseThisPanelProps {
  title: string;
  /** one line on what the code is for, shown while the panel is shut */
  summary: string;
  snippets: Snippet[];
}

/**
 * Code to paste, in the page rather than a dialog behind a menu: shut to one
 * line, so it costs the page nothing until someone wants to train on the data.
 */
const UseThisPanel: React.FC<UseThisPanelProps> = ({ title, summary, snippets }) => {
  const [open, setOpen] = useState(false);
  return (
    <Paper variant="outlined" component="section" aria-label={title} sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
      <ButtonBase
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', gap: 1.5, px: { xs: 1.5, sm: 2.5 }, py: 1.5, textAlign: 'left' }}
      >
        <CodeIcon aria-hidden sx={{ color: 'primary.main' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {summary}
          </Typography>
        </Box>
        <ExpandIcon aria-hidden sx={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pb: 2 }}>
          <SnippetList snippets={snippets} />
        </Box>
      </Collapse>
    </Paper>
  );
};

export default UseThisPanel;
