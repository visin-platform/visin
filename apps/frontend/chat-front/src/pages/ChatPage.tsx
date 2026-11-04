import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { NewChat } from '../components/newChat/NewChat';
import { ChatWorkspaceProvider } from '../contexts/ChatWorkspaceProvider';
import { useChatWorkspaceContext } from '../hooks/useChatWorkspaceContext';
import { chatService } from '../services/chatService';

import { analystSettingsHref } from '../utils/analystSettingsLink';

import { ConversationList } from '../components/chat/ConversationList';
import { ConversationThread } from '../components/chat/ConversationThread';
import { FindingDialog } from '../components/chat/FindingDialog';
import { PendingAnalysis } from '../components/chat/PendingAnalysis';
import { PeopleDialog } from '../components/chat/PeopleDialog';
import { useChatWorkspace } from '../hooks/useChatWorkspace';
export default function ChatPage({ panel = false }: { panel?: boolean }) {
  const workspace = useChatWorkspace({ panel });
  return (
    <ChatWorkspaceProvider value={workspace}>
      <WorkspaceView key={workspace.user?.id} panel={panel} />
    </ChatWorkspaceProvider>
  );
}

function WorkspaceView({ panel }: { panel: boolean }) {
  const {
    isLoading,
    isAuthenticated,
    login,
    detail,
    composing,
    canConfigure,
    show,
    c,
    enabled,
    assistantModel,
    analyze,
    pageContext,
    groups,
    sending,
    handle,
    openConversation,
    pending,
    error,
    setError
  } = useChatWorkspaceContext();

  if (isLoading) return <CircularProgress aria-label="Loading chat" />;
  if (!isAuthenticated)
    return (
      <Stack sx={{ p: 3 }} spacing={2}>
        <Typography>Sign in to message people and analyze training results.</Typography>
        <Button onClick={login}>Sign in</Button>
      </Stack>
    );
  return (
    <Box
      sx={{
        display: 'flex',
        position: 'relative',
        height: panel ? '100%' : 'calc(100dvh - 150px)',
        minHeight: panel ? 0 : 400,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        ...(panel ? {} : { border: 1, borderColor: 'divider', borderRadius: 2 })
      }}
    >
      <ConversationList panel={panel} />
      <Stack sx={{ flex: 1, minWidth: 0, display: !detail ? { xs: 'none', md: panel ? 'none' : 'flex' } : 'flex' }}>
        {c ? (
          <ConversationThread panel={panel} />
        ) : composing ? (
          <NewChat
            assistantModel={assistantModel}
            pageContext={pageContext}
            assistant={enabled}
            setupHref={canConfigure ? analystSettingsHref() : undefined}
            groups={groups}
            busy={sending}
            onBack={() => show(undefined)}
            onAnalysis={analyze}
            onPerson={(person) => void handle({ kind: 'direct', ...person })}
            onGroup={(groupId, title) => void handle({ kind: 'group', groupId, title })}
            onRoom={(title, handles, userIds) =>
              void openConversation(() => chatService.create({ kind: 'room', title, handles, userIds }))
            }
          />
        ) : pending ? (
          <PendingAnalysis panel={panel} />
        ) : (
          <Typography sx={{ p: 4, color: 'text.secondary' }}>Choose a conversation, or start a new chat.</Typography>
        )}
      </Stack>
      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 1500 }}
        >
          {error}
        </Alert>
      )}
      <PeopleDialog />
      <FindingDialog />
    </Box>
  );
}
