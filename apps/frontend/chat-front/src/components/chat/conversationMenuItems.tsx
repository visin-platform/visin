import { DeleteOutlined, ExitToApp, TopicOutlined, Visibility, VisibilityOff } from '@mui/icons-material';
import { Divider, ListItemIcon, ListItemText, MenuItem } from '@mui/material';
import type { ReactElement } from 'react';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import type { Conversation } from '../../types/chat';

/**
 * What a person can do to a conversation from its menu: put it away, and, where it is theirs or they are in it, delete
 * or leave it. Returned as a list, since a menu cannot hold a fragment. `topic` adds "New topic", for the open chat
 * with an assistant, whose header menu also has it.
 */
export function useConversationMenuItems(
  conversation: Conversation | undefined,
  close: () => void,
  options: { topic?: boolean } = {}
): ReactElement[] {
  const { user, hideChat, unhideChat, hidden, askDelete, leaveChat, startNewTopic } = useChatWorkspaceContext();
  if (!conversation) return [];
  const own = conversation.kind === 'assistant' && conversation.createdBy === user?.id;
  const leavable =
    ['direct', 'room'].includes(conversation.kind) &&
    conversation.participants.some((p) => p.userId === user?.id && p.state === 'active');
  const item = (key: string, label: string, icon: ReactElement, run: () => void, danger = false, hint?: string) => (
    <MenuItem
      key={key}
      onClick={() => {
        close();
        run();
      }}
      sx={danger ? { color: 'error.main' } : undefined}
    >
      <ListItemIcon sx={danger ? { color: 'error.main' } : undefined}>{icon}</ListItemIcon>
      <ListItemText secondary={hint}>{label}</ListItemText>
    </MenuItem>
  );
  const topic = options.topic && conversation.kind === 'assistant';
  const isHidden = hidden.some((item) => item._id === conversation._id);
  return [
    ...(topic
      ? [
          item(
            'topic',
            'New topic',
            <TopicOutlined fontSize="small" />,
            () => void startNewTopic(),
            false,
            'Starts fresh: earlier messages stay here but are no longer used'
          )
        ]
      : []),
    ...(topic ? [<Divider key="topic-divider" />] : []),
    isHidden
      ? item('unhide', 'Unhide', <Visibility fontSize="small" />, () => void unhideChat(conversation._id))
      : item('hide', 'Hide', <VisibilityOff fontSize="small" />, () => void hideChat(conversation)),
    ...(leavable
      ? [item('leave', 'Leave', <ExitToApp fontSize="small" />, () => void leaveChat(conversation._id), true)]
      : []),
    ...(own ? [item('delete', 'Delete', <DeleteOutlined fontSize="small" />, () => askDelete(conversation), true)] : [])
  ];
}
