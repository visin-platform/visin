import { Add, AutoAwesome, FolderOutlined, Forum, GroupsOutlined, PersonOutlined, Settings } from '@mui/icons-material';
import {
  Avatar,
  Badge,
  Box,
  Button,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography
} from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import type { Conversation } from '../../types/chat';
import { analystSettingsHref } from '../../utils/analystSettingsLink';
import { KIND_LABEL, displayTitle } from '../../utils/chatContext';
import { lastActiveLabel } from '../../utils/activity';
import { unreadCount } from '../../utils/unread';
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

export function ConversationList({ panel }: { panel: boolean }) {
  const { detail, canConfigure, show, setComposing, conversations, user, selected, loaded } = useChatWorkspaceContext();

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
      <List aria-label="Conversations" sx={{ px: 1 }}>
        {conversations.map((item) => {
          const member = item.participants.find((p) => p.userId === user?.id);
          const unread = item._id === selected ? 0 : unreadCount(item, user?.id);
          const Icon = KIND_ICON[item.kind];
          return (
            <ListItemButton
              key={item._id}
              selected={selected === item._id}
              onClick={() => show(item._id)}
              sx={{ borderRadius: 1.5, gap: 1.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
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
                        {item.latestMessage.body}
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
          );
        })}
      </List>
      {loaded && !conversations.length && (
        <Typography sx={{ px: 2, py: 1 }} color="text.secondary">
          Ask the analyst about a run, or message someone from their profile.
        </Typography>
      )}
    </Box>
  );
}
