import { useState } from 'react';
import { Assistants } from '../assistants/Assistants';
import { ArrowBack, GroupsOutlined, PersonOutlined, Search } from '@mui/icons-material';
import {
  Box,
  Button,
  Divider,
  InputAdornment,
  TextField,
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
  const [view, setView] = useState<'picker' | 'manage' | 'more'>('picker');
  const [search, setSearch] = useState('');
  const query = search.trim().replace(/^@/, '').toLowerCase();
  const people = contacts.filter((person) => person.name.toLowerCase().includes(query));
  const handle = /^@?[a-z0-9_-]+$/i.test(search.trim()) ? search.trim().replace(/^@/, '') : '';

  return (
    <Stack sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', px: 1, py: 1 }}>
        <IconButton aria-label={view === 'picker' ? 'Back to conversations' : 'Back to new chat'} onClick={() => view === 'picker' ? onBack() : setView('picker')}>
          <ArrowBack />
        </IconButton>
        <Typography sx={{ fontWeight: 700 }}>{view === 'manage' ? 'Manage assistants' : view === 'more' ? 'More chat options' : 'New chat'}</Typography>
      </Stack>
      <Divider />

      {view === 'picker' && (
        <Box sx={{ p: 2 }}>
          <Box component="form" onSubmit={(event) => {
            event.preventDefault();
            if (handle && !busy) onPerson({ handle, name: handle });
          }}>
            <TextField
              autoFocus
              size="small"
              fullWidth
              label="Search people or assistants"
              placeholder="Name or @handle"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }}
            />
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
            <Typography variant="subtitle2">Assistants</Typography>
            <Button size="small" onClick={() => setView('manage')}>Manage</Button>
          </Stack>
          <Assistants compact search={search} busy={busy || !assistant} onAnalysis={onAnalysis} pageContext={pageContext} />
          {!assistant && <Typography variant="caption" color="text.secondary">Assistant chats are currently unavailable.</Typography>}
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>People</Typography>
          <List dense disablePadding aria-label="People">
            {people.map((person) => (
              <ListItemButton key={person.id} disabled={busy} onClick={() => onPerson({ userId: person.id, name: person.name })} sx={{ borderRadius: 1, minHeight: 48 }}>
                <ListItemIcon sx={{ minWidth: 40 }}><PersonOutlined /></ListItemIcon>
                <ListItemText primary={person.name} />
              </ListItemButton>
            ))}
          </List>
          {handle && <Button fullWidth disabled={busy} onClick={() => onPerson({ handle, name: handle })} sx={{ justifyContent: 'flex-start', mt: 0.5 }}>Message @{handle}</Button>}
          {!people.length && <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{query ? 'No matching contacts. Enter a profile handle to start a chat.' : 'Enter a profile handle to message someone.'}</Typography>}
          <Button size="small" onClick={() => setView('more')} sx={{ mt: 2 }}>More options</Button>
        </Box>
      )}
      {view === 'manage' && (
        <Box sx={{ p: 2 }}>
          {!assistant && setupHref && <Button component="a" href={setupHref} variant="outlined">Set up the analyst</Button>}
          {!assistant && !setupHref && <Typography variant="body2" color="text.secondary">Ask an administrator to enable assistant chats.</Typography>}
          {assistantModel?.model && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Model: {assistantModel.provider} / {assistantModel.model}</Typography>}
          <Assistants busy={busy || !assistant} onAnalysis={onAnalysis} pageContext={pageContext} />
        </Box>
      )}
      {view === 'more' && <>
        <AnalystPicker pageContext={pageContext} assistant={assistant} setupHref={setupHref} busy={busy} onAnalysis={onAnalysis} projects={projects} showAssistants={false} />
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
      </>}
    </Stack>
  );
}
