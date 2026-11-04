import { useCallback, useState } from 'react';
import type { SharedAssistantSettings } from '../../types/assistant';
import { ReplyPreview } from './ReplyPreview';
import { AutoAwesome, MoreVert } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Link,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography
} from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { KIND_LABEL, displayTitle } from '../../utils/chatContext';
import { SharedAssistants } from '../assistants/SharedAssistants';
import { AnalystSetupNotice } from './AnalystSetupNotice';
import { BackToConversations } from './BackToConversations';
import { ChatContextChips } from './ChatContextChips';
import { Composer } from './Composer';
import { analystSettingsHref } from '../../utils/analystSettingsLink';
import { lastActiveLabel } from '../../utils/activity';
import { MessageList } from './MessageList';

export function ConversationThread({ panel }: { panel: boolean }) {
  const {
    forgetSelection,
    c,
    user,
    setShowPeople,
    enabled,
    analyze,
    me,
    membership,
    sending,
    connection,
    sharedAvailable,
    sharedTarget,
    chooseSharedAssistant,
    canConfigure,
    draft,
    setDraft,
    send,
    composerInput,
    sharedSettings,
    setSharedSettings,
    replyTarget,
    setReplyTarget
  } = useChatWorkspaceContext();
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const receiveSettings = useCallback(
    (settings: SharedAssistantSettings | undefined) => setSharedSettings({ conversationId: c?._id || '', settings }),
    [c?._id, setSharedSettings]
  );
  if (!c) return null;
  const settings = sharedSettings?.conversationId === c._id ? sharedSettings.settings : undefined;
  return (
    <>
      <Stack direction="row" sx={{ p: 1.5, alignItems: 'center', gap: 1 }}>
        <BackToConversations panel={panel} onBack={forgetSelection} />
        {c.profile ? (
          <Link
            href={`/u/${encodeURIComponent(c.profile.handle)}`}
            aria-label={`View ${c.profile.name || displayTitle(c, user?.id)} profile`}
            sx={{ display: 'inline-flex', borderRadius: '50%', flexShrink: 0 }}
          >
            <Avatar
              src={c.profile.picture}
              alt={c.profile.name || displayTitle(c, user?.id)}
              slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
              sx={{ width: 40, height: 40 }}
            >
              {(c.profile.name || displayTitle(c, user?.id)).charAt(0).toUpperCase()}
            </Avatar>
          </Link>
        ) : (
          <Avatar sx={{ width: 40, height: 40 }}>{displayTitle(c, user?.id).charAt(0).toUpperCase()}</Avatar>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>
            {displayTitle(c, user?.id)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {c.kind === 'assistant' ? 'Private analysis · only you can read it' : KIND_LABEL[c.kind]}
            {c.kind === 'direct' &&
              lastActiveLabel(c.profile?.lastActiveAt) &&
              ` · ${lastActiveLabel(c.profile?.lastActiveAt)}`}
          </Typography>
        </Box>
        {c.kind !== 'assistant' && (
          <Button size="small" onClick={() => setShowPeople(true)}>
            People
          </Button>
        )}
        {c.kind !== 'assistant' && c.projectId && enabled && (
          <Button
            size="small"
            startIcon={<AutoAwesome />}
            onClick={() => analyze({ projectId: c.projectId, trainingIds: c.trainingIds, title: c.projectName })}
          >
            Ask privately
          </Button>
        )}
        <IconButton
          aria-label="Conversation settings"
          aria-haspopup="menu"
          aria-expanded={!!settingsAnchor}
          onClick={(event) => setSettingsAnchor(event.currentTarget)}
        >
          <MoreVert />
        </IconButton>
        <Menu anchorEl={settingsAnchor} open={!!settingsAnchor} onClose={() => setSettingsAnchor(null)}>
          {c.profile && (
            <MenuItem
              component="a"
              href={`/u/${encodeURIComponent(c.profile.handle)}`}
              onClick={() => setSettingsAnchor(null)}
            >
              View profile
            </MenuItem>
          )}
          {c.kind !== 'assistant' && (
            <MenuItem
              onClick={() => {
                setSettingsAnchor(null);
                setShowPeople(true);
              }}
            >
              People and permissions
            </MenuItem>
          )}
          {canConfigure && (
            <MenuItem component="a" href={analystSettingsHref()} onClick={() => setSettingsAnchor(null)}>
              Analyst settings
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setSettingsAnchor(null);
              forgetSelection();
            }}
          >
            Back to conversations
          </MenuItem>
        </Menu>
      </Stack>
      {<ChatContextChips context={c} labels={c.trainingLabels} />}
      <Divider />
      {me?.state === 'invited' && (
        <Alert
          severity="info"
          action={
            <Stack direction="row">
              <Button onClick={() => void membership('accept')}>Accept</Button>
              <Button onClick={() => void membership('decline')}>Decline</Button>
            </Stack>
          }
        >
          You have a conversation request.
        </Alert>
      )}
      {connection !== 'live' && (
        <Typography role="status" variant="caption" sx={{ px: 2 }}>
          {connection === 'offline'
            ? 'Offline · waiting for a connection'
            : connection === 'connecting'
              ? 'Connecting…'
              : 'Reconnecting · checking for messages'}
        </Typography>
      )}
      <MessageList />
      {c.kind !== 'assistant' && enabled && sharedAvailable && me?.state !== 'invited' && (
        <SharedAssistants
          key={`${user?.id}:${c._id}`}
          conversationId={c._id}
          target={sharedTarget}
          onTarget={chooseSharedAssistant}
          busy={sending}
          onSettings={receiveSettings}
        />
      )}
      {c.kind === 'assistant' && !enabled && <AnalystSetupNotice canConfigure={canConfigure} />}
      {replyTarget && (
        <ReplyPreview
          message={replyTarget}
          shared={c.kind !== 'assistant'}
          onCancel={() => setReplyTarget(undefined)}
        />
      )}
      <Composer
        label={c.kind === 'assistant' ? 'Ask a follow-up' : 'Message'}
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        sending={sending}
        inputRef={composerInput}
        assistants={c.kind !== 'assistant' && enabled && settings?.enabled ? settings.bots : undefined}
        selectedAssistantId={sharedTarget}
        onMention={chooseSharedAssistant}
        hint={panel ? undefined : 'Enter to send, Shift+Enter for a new line'}
        disabled={me?.state === 'invited' || (c.kind === 'assistant' && !enabled)}
      />
    </>
  );
}
