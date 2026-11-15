import { Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowBack } from '@mui/icons-material';
import { Box, IconButton, Typography } from '@mui/material';
import { Loader, chrome } from '@visin/frontend-core';
import { forgetChatPanel, remoteChatPanel } from '../../remotes';
import { RemoteBoundary } from '../RemoteBoundary';

/**
 * Chat on a phone: the whole screen, like every messaging app, with one bar on top whose arrow leaves chat. The app
 * bar and the tab bar under it would cost a fifth of the height and put a second way out next to the first.
 *
 * It is the side panel's chat (list, then one conversation with its own arrow back to the list), so a phone and the
 * desktop panel behave the same; `?conversation=` still opens that conversation, as a notification's link does.
 */
export function MobileChat({ title }: { title: string }) {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const Panel = remoteChatPanel();
  // Back to wherever chat was opened from; straight in from a link or a notification, there is nowhere back to.
  const leave = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <Box
      component="main"
      sx={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        pt: 'env(safe-area-inset-top)',
        pb: 'env(safe-area-inset-bottom)',
        pl: 'env(safe-area-inset-left)',
        pr: 'env(safe-area-inset-right)'
      }}
    >
      <Box
        component="header"
        sx={{
          ...chrome.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.5,
          minHeight: 52,
          borderBottom: `1px solid ${chrome.edge}`
        }}
      >
        <IconButton aria-label="Leave chat" onClick={leave}>
          <ArrowBack />
        </IconButton>
        <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <RemoteBoundary
          key={attempt}
          appTitle={title}
          onRetry={() => {
            forgetChatPanel();
            setAttempt((n) => n + 1);
          }}
        >
          <Suspense fallback={<Loader fullHeight={false} message="Loading chat…" />}>
            <Panel />
          </Suspense>
        </RemoteBoundary>
      </Box>
    </Box>
  );
}
