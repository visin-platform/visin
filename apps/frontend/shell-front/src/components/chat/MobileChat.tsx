import { Suspense, useState } from 'react';
import { Box } from '@mui/material';
import { Loader } from '@visin/frontend-core';
import { forgetChatPanel, remoteChatPanel } from '../../remotes';
import { RemoteBoundary } from '../RemoteBoundary';
import { usePageMeta } from '../../hooks/usePageMeta';

/**
 * Chat on a phone: the conversation list between the app bar and the tab bar, where the Chat tab is, and one
 * conversation over the whole screen (`ShellLayout` takes the bars away while one is open). It is the side panel's
 * chat — a list, then one conversation with its own arrow back to the list — so a phone and the desktop panel behave
 * the same; `?conversation=` still opens that conversation, as a notification's link does.
 */
export function MobileChat({ title }: { title: string }) {
  const [attempt, setAttempt] = useState(0);
  // Its own name in the tab and the recent-apps list, not the page chat was opened from; private, so never indexed.
  usePageMeta({ title: `${title} · Visin`, noindex: true });
  const Panel = remoteChatPanel();
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
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
  );
}
