import { useEffect, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  ArrowBack,
  AutoAwesome,
  FolderOutlined,
  Forum,
  GroupsOutlined,
  HelpOutlined,
  PersonOutlined
} from '@mui/icons-material';
import { api, type PageContext } from './api';

interface Person {
  handle?: string;
  userId?: string;
  name: string;
}

interface NewChatProps {
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

const handlesOf = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((handle) => handle.trim().replace(/^@/, ''))
    .filter(Boolean);

function Section({
  icon,
  title,
  note,
  children
}: {
  icon: ReactNode;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <Box component="section" aria-label={title} sx={{ px: 2, py: 2 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 1 }}>
        {note}
      </Typography>
      {children}
    </Box>
  );
}

/** What a new conversation is with: the analyst, a person, a group, or a few people. */
export function NewChat({
  pageContext,
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
  const [projects, setProjects] = useState<{ _id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [handle, setHandle] = useState('');
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomHandles, setRoomHandles] = useState('');
  const [roomContacts, setRoomContacts] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const settle = <T,>(path: string, set: (rows: T[]) => void) =>
      void api<T[]>(path, undefined, controller.signal)
        .then((rows) => {
          if (!controller.signal.aborted) set(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) set([]);
        });
    settle('/projects', setProjects);
    settle('/contacts', setContacts);
    return () => controller.abort();
  }, []);

  const roomPeople = handlesOf(roomHandles).length + roomContacts.length;

  return (
    <Stack sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', px: 1, py: 1 }}>
        <IconButton aria-label="Back to conversations" onClick={onBack}>
          <ArrowBack />
        </IconButton>
        <Typography sx={{ fontWeight: 700 }}>New chat</Typography>
      </Stack>
      <Divider />

      <Section
        icon={<AutoAwesome />}
        title="Ask the analyst"
        note={
          assistant
            ? 'A private conversation about results you can see. Only you can read it.'
            : setupHref
              ? 'The analyst is not turned on yet.'
              : 'The analyst is not turned on for this deployment. Ask an administrator.'
        }
      >
        {!assistant && setupHref && (
          <Button variant="outlined" component="a" href={setupHref}>
            Set up the analyst
          </Button>
        )}
        {assistant && (
          <List dense disablePadding aria-label="Analyse">
            {pageContext?.projectId && (
              <ListItemButton disabled={busy} onClick={() => onAnalysis(pageContext)} sx={{ borderRadius: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <AutoAwesome fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={pageContext.title || 'This page'} secondary="What you are looking at" />
              </ListItemButton>
            )}
            <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
              {projects.map((project) => (
                <ListItemButton
                  key={project._id}
                  disabled={busy}
                  onClick={() =>
                    onAnalysis({
                      projectId: project._id,
                      trainingIds: [],
                      title: project.name,
                      projectName: project.name
                    })
                  }
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FolderOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={project.name} />
                </ListItemButton>
              ))}
            </Box>
            <ListItemButton
              disabled={busy}
              onClick={() => onAnalysis({ title: 'General question' })}
              sx={{ borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <HelpOutlined fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="General question" secondary="Not about one project" />
            </ListItemButton>
          </List>
        )}
      </Section>
      <Divider />

      <Section
        icon={<PersonOutlined />}
        title="Message a person"
        note="They accept your first message before the conversation opens. Chat never shares project access."
      >
        <Stack
          direction="row"
          spacing={1}
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            const [first] = handlesOf(handle);
            if (first) onPerson({ handle: first, name: first });
          }}
        >
          <TextField
            size="small"
            fullWidth
            label="Profile handle"
            placeholder="@handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
          />
          <Button type="submit" variant="outlined" disabled={busy || !handlesOf(handle).length}>
            Message
          </Button>
        </Stack>
        {contacts.length > 0 && (
          <>
            <Typography variant="overline" component="p" sx={{ color: 'text.secondary', mt: 1.5 }}>
              From your groups
            </Typography>
            <List dense disablePadding aria-label="Group colleagues" sx={{ maxHeight: 200, overflow: 'auto' }}>
              {contacts.map((contact) => (
                <ListItemButton
                  key={contact.id}
                  disabled={busy}
                  onClick={() => onPerson({ userId: contact.id, name: contact.name })}
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <PersonOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={contact.name} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
      </Section>
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

      <Section icon={<Forum />} title="Start a room" note="A conversation with a few people, each invited by name.">
        {!roomOpen ? (
          <Button variant="outlined" onClick={() => setRoomOpen(true)}>
            New room
          </Button>
        ) : null}
        <Collapse in={roomOpen} unmountOnExit>
          <Stack spacing={1.5}>
            <TextField
              size="small"
              label="Room name"
              value={roomTitle}
              onChange={(event) => setRoomTitle(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              size="small"
              label="People's handles"
              placeholder="@ada @grace"
              value={roomHandles}
              onChange={(event) => setRoomHandles(event.target.value)}
            />
            {contacts.length > 0 && (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }} aria-label="Add colleagues">
                {contacts.map((contact) => {
                  const chosen = roomContacts.includes(contact.id);
                  return (
                    <Button
                      key={contact.id}
                      size="small"
                      variant={chosen ? 'contained' : 'outlined'}
                      aria-pressed={chosen}
                      onClick={() =>
                        setRoomContacts((ids) =>
                          chosen ? ids.filter((id) => id !== contact.id) : [...ids, contact.id]
                        )
                      }
                    >
                      {contact.name}
                    </Button>
                  );
                })}
              </Stack>
            )}
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                disabled={busy || !roomTitle.trim() || roomPeople === 0}
                onClick={() => onRoom(roomTitle.trim(), handlesOf(roomHandles), roomContacts)}
              >
                Create room
              </Button>
              <Button onClick={() => setRoomOpen(false)}>Cancel</Button>
            </Stack>
          </Stack>
        </Collapse>
      </Section>
    </Stack>
  );
}
