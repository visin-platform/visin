import React from 'react';
import { Button } from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../config/ConfigProvider';

/**
 * Opens a private chat with the analyst about this paper: it can summarize it, find where a result is reported, and
 * check the figures against the recorded runs the paper cites. Only for someone signed in, since chat is.
 */
const AskAboutPaper: React.FC<{ paperId: string; title: string }> = ({ paperId, title }) => {
  const { isAuthenticated } = useAuth();
  const config = useConfig();
  const open = () => {
    const detail = { kind: 'assistant', paperId, title };
    // Opened on its own (outside the shell), chat is a page of the shell: go there with the paper named in the address.
    if (window.top === window && !document.getElementById('shell-root') && config.SHELL_FRONT_URL) {
      const url = new URL('/chat', config.SHELL_FRONT_URL);
      url.searchParams.set('paper', paperId);
      url.searchParams.set('title', title);
      window.location.assign(url.href);
    } else window.dispatchEvent(new CustomEvent('visin:open-chat', { detail }));
  };
  if (!isAuthenticated) return null;
  return (
    <Button variant="contained" size="small" startIcon={<AutoAwesome />} onClick={open}>
      Ask about this paper
    </Button>
  );
};

export default AskAboutPaper;
