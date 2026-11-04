import { PersonOutlined } from '@mui/icons-material';
import { Button, List, ListItemButton, ListItemIcon, ListItemText, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import type { ChatContact } from '../../types/chat';
import { handlesOf } from '../../utils/handles';
import { Section } from './NewChatSection';
export function PersonPicker({
  contacts,
  busy,
  onPerson
}: {
  contacts: ChatContact[];
  busy: boolean;
  onPerson: (person: { handle?: string; userId?: string; name: string }) => void;
}) {
  const [handle, setHandle] = useState('');
  return (
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
  );
}
