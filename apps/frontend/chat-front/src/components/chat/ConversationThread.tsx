import { chatChrome } from '../../appearance/chatAppearance';
import { useEffect, useState } from 'react';
import type { Conversation } from '../../types/chat';
import { ExportConversationDialog } from './ExportConversationDialog';
import { SearchConversationDialog } from './SearchConversationDialog';
import { ReplyPreview } from './ReplyPreview';
import { EditingPreview } from './EditingPreview';
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
import { AnalystSetupNotice } from './AnalystSetupNotice';
import { CallButtons } from './CallButtons';
import { BackToConversations } from './BackToConversations';
import { AskingAbout } from './AskingAbout';
import { ChatContextChips } from './ChatContextChips';
import { useConversationMenuItems } from './conversationMenuItems';
import { MediaComposer } from './MediaComposer';
import { analystSettingsHref } from '../../utils/analystSettingsLink';
import { lastActiveLabel } from '../../utils/activity';
import { MessageList } from './MessageList';
import { stoppable } from '../../utils/runs';
import { chatService } from '../../services/chatService';
import { useAllowance } from '../../hooks/useAllowance';
import { AllowanceNotice } from './AllowanceNotice';
import { inAppPath, openBesideChat } from '../../utils/inAppLinks';

export function ConversationThread({ panel }: { panel: boolean }) {
  const {
    setAppearanceOpen,
    openConversation,
    forgetSelection,
    c,
    user,
    setShowPeople,
    enabled,
    openAbout,
    about,
    clearAbout,
    me,
    membership,
    sending,
    attachmentsAvailable,
    connection,
    canConfigure,
    draft,
    setDraft,
    send,
    composerInput,
    replyTarget,
    setReplyTarget,
    runs,
    perform,
    selected,
    editing,
    cancelEdit,
    dropEdit
  } = useChatWorkspaceContext();
  const [exporting, setExporting] = useState<{ conversation: Conversation; title: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [voiceTarget, setVoiceTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setExporting(null);
    setSearching(false);
    dropEdit();
  }, [c?._id, dropEdit]);
  const menuItems = useConversationMenuItems(c, () => setSettingsAnchor(null), { topic: true });
  const { data: allowance } = useAllowance(c?.kind === 'assistant' && enabled);
  if (!c) return null;
  return (
    <>
      <Stack
        component="header"
        role="group"
        aria-label="Conversation header"
        direction="row"
        sx={(theme) => ({
          ...chatChrome(theme),
          p: 1.5,
          alignItems: 'center',
          gap: { xs: 0, sm: 1 },
          position: 'relative',
          zIndex: 1,
          borderBottom: 1,
          borderColor: 'divider'
        })}
      >
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
          <Typography noWrap variant="caption" sx={{ color: 'text.secondary' }}>
            {c.kind === 'assistant'
              ? `Private chat · you and ${c.profile?.name || 'this assistant'}`
              : c.kind === 'direct'
                ? 'Private conversation'
                : KIND_LABEL[c.kind]}
            {c.kind === 'direct' &&
              lastActiveLabel(c.profile?.lastActiveAt) &&
              ` · ${lastActiveLabel(c.profile?.lastActiveAt)}`}
          </Typography>
        </Box>
        {c.kind !== 'assistant' && c.projectId && enabled && (
          <Button
            size="small"
            startIcon={<AutoAwesome />}
            onClick={() => openAbout({ projectId: c.projectId, trainingIds: c.trainingIds, title: c.projectName })}
          >
            Ask privately
          </Button>
        )}
        <Box ref={setVoiceTarget} sx={{ display: 'flex', flexShrink: 0 }} />
        <CallButtons
          key={c._id}
          conversation={c}
          userId={user?.id}
          onOpenConversation={(conversation) => void openConversation(async () => conversation)}
        />
        <IconButton
          aria-label="Conversation settings"
          aria-haspopup="menu"
          aria-expanded={!!settingsAnchor}
          onClick={(event) => setSettingsAnchor(event.currentTarget)}
        >
          <MoreVert />
        </IconButton>
        <Menu anchorEl={settingsAnchor} open={!!settingsAnchor} onClose={() => setSettingsAnchor(null)}>
          <MenuItem
            onClick={() => {
              setSettingsAnchor(null);
              setAppearanceOpen(true);
            }}
          >
            Appearance
          </MenuItem>
          {c.profile && (
            <MenuItem
              component="a"
              href={`/u/${encodeURIComponent(c.profile.handle)}`}
              onClick={() => setSettingsAnchor(null)}
            >
              View profile
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setSettingsAnchor(null);
              setSearching(true);
            }}
          >
            Search messages
          </MenuItem>
          <MenuItem
            onClick={() => {
              setSettingsAnchor(null);
              setShowPeople(true);
            }}
          >
            People
          </MenuItem>
          <MenuItem
            onClick={() => {
              setSettingsAnchor(null);
              setExporting({ conversation: { ...c }, title: displayTitle(c, user?.id) });
            }}
          >
            Export as Markdown
          </MenuItem>
          {canConfigure && (
            <MenuItem component="a" href={analystSettingsHref()} onClick={() => setSettingsAnchor(null)}>
              Analyst settings
            </MenuItem>
          )}
          <Divider />
          {menuItems}
        </Menu>
      </Stack>
      {c.kind !== 'assistant' && <ChatContextChips context={c} labels={c.trainingLabels} />}
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
      {exporting && exporting.conversation._id === c._id && (
        <ExportConversationDialog
          conversation={exporting.conversation}
          title={exporting.title}
          onClose={() => setExporting(null)}
        />
      )}
      {searching && <SearchConversationDialog conversationId={c._id} onClose={() => setSearching(false)} />}
      {/* A link to a Visin page in an answer opens it beside the chat, so the thread stays where it is. */}
      <Box
        sx={{ display: 'contents' }}
        onClick={(event) => {
          const path = panel ? inAppPath(event) : undefined;
          if (!path) return;
          event.preventDefault();
          openBesideChat(path);
        }}
      >
        <MessageList />
      </Box>
      {c.kind === 'assistant' && !enabled && <AnalystSetupNotice canConfigure={canConfigure} />}
      {c.kind === 'assistant' && enabled && <AllowanceNotice allowance={allowance} />}
      {c.kind === 'assistant' && <AskingAbout about={about} name={c.profile?.name} onClear={clearAbout} />}
      {editing && <EditingPreview onCancel={cancelEdit} />}
      {replyTarget && !editing && <ReplyPreview message={replyTarget} onCancel={() => setReplyTarget(undefined)} />}
      <MediaComposer
        key={c._id}
        voiceTarget={voiceTarget}
        conversationId={c._id}
        filesEnabled={Boolean(attachmentsAvailable)}
        assistant={c.kind === 'assistant'}
        label={c.kind === 'assistant' ? 'Ask a follow-up' : 'Message'}
        value={draft}
        onChange={setDraft}
        onSendFiles={async (files) => await send(files)}
        sending={sending}
        inputRef={composerInput}
        hint={panel ? undefined : 'Enter to send, Shift+Enter for a new line'}
        disabled={me?.state === 'invited' || (c.kind === 'assistant' && !enabled)}
        commands={c.kind === 'assistant'}
        onStop={
          stoppable(runs, c, user?.id)
            ? () =>
                void perform(async () => {
                  await chatService.cancel(selected!);
                })
            : undefined
        }
      />
    </>
  );
}
