import { Forum } from '@mui/icons-material';
import { Button, Collapse, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import type { ChatContact } from '../../types/chat';
import { handlesOf } from '../../utils/handles';
import { Section } from './NewChatSection';
export function RoomForm({
  contacts,
  busy,
  onRoom
}: {
  contacts: ChatContact[];
  busy: boolean;
  onRoom: (title: string, handles: string[], userIds: string[]) => void;
}) {
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomHandles, setRoomHandles] = useState('');
  const [roomContacts, setRoomContacts] = useState<string[]>([]);
  const roomPeople = handlesOf(roomHandles).length + roomContacts.length;
  return (
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
                      setRoomContacts((ids) => (chosen ? ids.filter((id) => id !== contact.id) : [...ids, contact.id]))
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
  );
}
