import {
  Add,
  AutoAwesome,
  ExpandLess,
  ExpandMore,
  FolderOutlined,
  Forum,
  GroupsOutlined,
  PersonOutlined,
  MoreVert,
  PaletteOutlined,
  Settings
} from '@mui/icons-material';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  Stack,
  Typography
} from '@mui/material';
import { useState } from 'react';
import { useCompactLayout } from '@visin/frontend-core';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import type { Conversation } from '../../types/chat';
import { analystSettingsHref } from '../../utils/analystSettingsLink';
import { KIND_LABEL, aboutLabel, displayTitle } from '../../utils/chatContext';
import { lastActiveLabel } from '../../utils/activity';
import { plainPreview } from '../../utils/preview';
import { unreadCount } from '../../utils/unread';
import { useConversationMenuItems } from './conversationMenuItems';
import { NotificationToggle } from './NotificationToggle';
const KIND_ICON: Record<Conversation['kind'], typeof AutoAwesome> = {
  assistant: AutoAwesome,
  direct: PersonOutlined,
  room: Forum,
  group: GroupsOutlined,
  project: FolderOutlined
};

function conversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
  });
}

/** The ⋯ of a row: put it away, delete it, leave it. Always there on a touch screen; on a pointer, when it is looked at. */
function RowMenu({ conversation, title }: { conversation: Conversation; title: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton
        size="small"
        className="row-menu"
        aria-label={`Options for ${title}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVert fontSize="small" />
      </IconButton>
      {anchor && <RowMenuItems conversation={conversation} anchor={anchor} close={() => setAnchor(null)} />}
    </>
  );
}

/** Built only while open: a list of a hundred rows does not make a hundred menus on every update. */
function RowMenuItems({ conversation, anchor, close }: { conversation: Conversation; anchor: HTMLElement; close: () => void }) {
  const items = useConversationMenuItems(conversation, close);
  return (
    <Menu anchorEl={anchor} open onClose={close}>
      {items}
    </Menu>
  );
}

const rowSx = {
  '& .row-menu': { opacity: 0 },
  '&:hover .row-menu, &:focus-within .row-menu, & .row-menu[aria-expanded="true"]': { opacity: 1 },
  '@media (hover: none)': { '& .row-menu': { opacity: 1 } }
} as const;

/** Conversations put away: out of the list, never lost. Opening one shows it; Unhide puts it back. */
function HiddenChats() {
  const { hidden, show, unhideChat, user } = useChatWorkspaceContext();
  const [open, setOpen] = useState(false);
  if (!hidden.length) return null;
  return (
    <>
      <ListItemButton onClick={() => setOpen(!open)} aria-expanded={open} sx={{ borderRadius: 1.5, mt: 1 }}>
        <ListItemText primary={`Hidden (${hidden.length})`} slotProps={{ primary: { variant: 'body2' } }} />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>
      <Collapse in={open} unmountOnExit>
        <List dense aria-label="Hidden conversations" disablePadding>
          {hidden.map((item) => (
            <ListItem
              key={item._id}
              disablePadding
              secondaryAction={
                <Button size="small" onClick={() => void unhideChat(item._id)}>
                  Unhide
                </Button>
              }
            >
              <ListItemButton onClick={() => show(item._id)} sx={{ borderRadius: 1.5, pr: 10 }}>
                <ListItemText primary={displayTitle(item, user?.id)} secondary={KIND_LABEL[item.kind]} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Collapse>
    </>
  );
}

export function ConversationList({ panel }: { panel: boolean }) {
  const {
    setAppearanceOpen,
    detail,
    canConfigure,
    show,
    setComposing,
    conversations,
    user,
    selected,
    loaded,
    about,
    openAbout
  } = useChatWorkspaceContext();
  // On a phone chat is a tab, one tap from the run or project the person was looking at: so the list leads with a way
  // to ask about it, instead of a trip back to that page's own button.
  const compact = useCompactLayout();
  const aboutThis = compact ? aboutLabel(about) : '';

  return (
    <Box
      sx={{
        width: { xs: '100%', md: panel ? '100%' : 320 },
        flexShrink: 0,
        display: detail ? { xs: 'none', md: panel ? 'none' : 'flex' } : 'flex',
        flexDirection: 'column',
        borderRight: panel ? 0 : 1,
        borderColor: 'divider',
        overflow: 'auto'
      }}
    >
      <Stack direction="row" sx={{ px: 1.5, py: 1.5, gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography noWrap sx={{ fontWeight: 700, minWidth: 0 }}>
          Conversations
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <IconButton size="small" aria-label="Chat appearance" onClick={() => setAppearanceOpen(true)}>
            <PaletteOutlined fontSize="small" />
          </IconButton>
          <NotificationToggle />
          {canConfigure && (
            // Account's Analyst section: the settings are a page of their own, not part of a conversation.
            <IconButton size="small" aria-label="Analyst settings" component="a" href={analystSettingsHref()}>
              <Settings fontSize="small" />
            </IconButton>
          )}
          <Button
            variant="contained"
            size="small"
            disableElevation
            sx={{
              whiteSpace: 'nowrap',
              minWidth: 0,
              height: 30,
              px: 1,
              fontSize: '0.75rem',
              '& .MuiButton-startIcon': { mr: 0.5, ml: 0 }
            }}
            startIcon={<Add />}
            onClick={() => {
              show(undefined);
              setComposing(true);
            }}
          >
            New chat
          </Button>
        </Stack>
      </Stack>
      {about && aboutThis && (
        <Box sx={{ px: 1.5, pb: 1 }}>
          <ListItemButton
            onClick={() => openAbout(about)}
            sx={{ gap: 1.5, borderRadius: 2, border: 1, borderColor: 'primary.main', color: 'primary.main' }}
          >
            <AutoAwesome fontSize="small" />
            <ListItemText
              primary="Ask about this"
              secondary={aboutThis}
              slotProps={{ primary: { sx: { fontWeight: 700 } }, secondary: { noWrap: true } }}
              sx={{ minWidth: 0, my: 0 }}
            />
          </ListItemButton>
        </Box>
      )}
      <List aria-label="Conversations" sx={{ px: 1 }}>
        {conversations.map((item) => {
          const member = item.participants.find((p) => p.userId === user?.id);
          const unread = item._id === selected ? 0 : unreadCount(item, user?.id);
          const Icon = KIND_ICON[item.kind];
          return (
            <ListItem
              key={item._id}
              disablePadding
              sx={rowSx}
              secondaryAction={<RowMenu conversation={item} title={displayTitle(item, user?.id)} />}
            >
            <ListItemButton
              selected={selected === item._id}
              onClick={() => show(item._id)}
              sx={{ borderRadius: 1.5, gap: 1.5, py: 1.5, pr: 6, borderBottom: 1, borderColor: 'divider' }}
            >
              <Avatar src={item.profile?.picture} alt="" sx={{ width: 40, height: 40 }}>
                {item.kind === 'direct' || item.kind === 'assistant' ? (
                  (item.profile?.name || displayTitle(item, user?.id)).charAt(0).toUpperCase()
                ) : (
                  <Icon fontSize="small" />
                )}
              </Avatar>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <Typography noWrap sx={{ fontWeight: unread ? 700 : 600, minWidth: 0 }}>
                      {displayTitle(item, user?.id)}
                    </Typography>
                    {item.latestMessage && (
                      <Typography variant="caption" sx={{ flexShrink: 0, color: 'text.secondary' }}>
                        {conversationDate(item.latestMessage.createdAt)}
                      </Typography>
                    )}
                  </Stack>
                }
                secondary={
                  <>
                    <Typography component="span" variant="caption" noWrap sx={{ display: 'block' }}>
                      {member?.state === 'invited' ? 'Wants to talk · accept or decline' : KIND_LABEL[item.kind]}
                      {member?.state !== 'invited' &&
                        item.kind === 'direct' &&
                        lastActiveLabel(item.profile?.lastActiveAt) &&
                        ` · ${lastActiveLabel(item.profile?.lastActiveAt)}`}
                    </Typography>
                    {item.latestMessage && (
                      <Typography component="span" variant="body2" noWrap sx={{ display: 'block' }}>
                        {plainPreview(item.latestMessage.body)}
                      </Typography>
                    )}
                  </>
                }
                slotProps={{ primary: { component: 'div' }, secondary: { component: 'div' } }}
                sx={{ minWidth: 0, my: 0 }}
              />
              {unread > 0 && (
                <Badge
                  color="primary"
                  badgeContent={unread}
                  max={99}
                  aria-label={`${unread} unread`}
                  sx={{ mr: 1.5 }}
                />
              )}
            </ListItemButton>
            </ListItem>
          );
        })}
        <HiddenChats />
      </List>
      {loaded && !conversations.length && (
        <Typography sx={{ px: 2, py: 1 }} color="text.secondary">
          Ask the analyst about a run, or message someone from their profile.
        </Typography>
      )}
    </Box>
  );
}
