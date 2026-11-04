import { ArrowBack, GroupsOutlined } from '@mui/icons-material';
import {
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography
} from '@mui/material';
import { useChatDirectory } from '../../hooks/useChatDirectory';
import type { Capabilities, PageContext } from '../../types/chat';
import { AnalystPicker } from './AnalystPicker';
import { Section } from './NewChatSection';
import { PersonPicker } from './PersonPicker';
import { RoomForm } from './RoomForm';
interface Person {
  handle?: string;
  userId?: string;
  name: string;
}
interface NewChatProps {
  assistantModel?: Capabilities['assistantModel'];
  /** What the page being shown is about, offered first. */
  pageContext?: PageContext;
  /** Whether the analyst is on and ready for this deployment. */
  assistant: boolean;
  /** Where an administrator turns it on (Account's Analyst section); left out for everyone else. */
  setupHref?: string;
  groups: { groupId: string; name: string }[];
  busy: boolean;
  onBack: () => void;
  onAnalysis: (context: PageContext) => void;
  onPerson: (person: Person) => void;
  onGroup: (groupId: string, name: string) => void;
  onRoom: (title: string, handles: string[], userIds: string[]) => void;
}
export function NewChat({
  pageContext,
  assistantModel,
  assistant,
  setupHref,
  groups,
  busy,
  onBack,
  onAnalysis,
  onPerson,
  onGroup,
  onRoom
}: NewChatProps) {
  const { projects, contacts } = useChatDirectory();
  return (
    <Stack sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', px: 1, py: 1 }}>
        <IconButton aria-label="Back to conversations" onClick={onBack}>
          <ArrowBack />
        </IconButton>
        <Typography sx={{ fontWeight: 700 }}>New chat</Typography>
      </Stack>
      <Divider />

      <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1 }}>
        {assistantModel?.model
          ? `Deployment model: ${assistantModel.provider} / ${assistantModel.model}${assistantModel.ready ? '' : ' · unavailable'}`
          : 'Deployment model unavailable'}
      </Typography>
      <AnalystPicker
        pageContext={pageContext}
        assistant={assistant}
        setupHref={setupHref}
        busy={busy}
        onAnalysis={onAnalysis}
        projects={projects}
      />
      <Divider />

      <PersonPicker contacts={contacts} busy={busy} onPerson={onPerson} />
      <Divider />

      {groups.length > 0 && (
        <>
          <Section icon={<GroupsOutlined />} title="Message a group" note="Its channel, for everyone in the group.">
            <List dense disablePadding aria-label="Your groups">
              {groups.map((group) => (
                <ListItemButton
                  key={group.groupId}
                  disabled={busy}
                  onClick={() => onGroup(group.groupId, group.name)}
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <GroupsOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={group.name} />
                </ListItemButton>
              ))}
            </List>
          </Section>
          <Divider />
        </>
      )}

      <RoomForm contacts={contacts} busy={busy} onRoom={onRoom} />
    </Stack>
  );
}
