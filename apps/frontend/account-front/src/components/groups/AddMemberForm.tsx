import React, { useState } from 'react';
import { Box, Button, MenuItem, TextField } from '@mui/material';
import { PersonAdd } from '@mui/icons-material';
import { GroupRole } from '../../types/group';

interface AddMemberFormProps {
  busy: boolean;
  /** Owners may add another owner; admins may not. */
  canAddOwner: boolean;
  onAdd: (email: string, role: GroupRole) => void;
}

const AddMemberForm: React.FC<AddMemberFormProps> = ({ busy, canAddOwner, onAdd }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<GroupRole>('member');

  const roles: GroupRole[] = canAddOwner ? ['owner', 'admin', 'member'] : ['admin', 'member'];
  const trimmed = email.trim();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    onAdd(trimmed, role);
    setEmail('');
    setRole('member');
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <TextField
        size="small"
        type="email"
        label="Email address"
        value={email}
        onChange={event => setEmail(event.target.value)}
        disabled={busy}
        sx={{ flexGrow: 1 }}
      />
      <TextField
        size="small"
        select
        label="Role"
        value={role}
        onChange={event => setRole(event.target.value as GroupRole)}
        disabled={busy}
        sx={{ width: 140 }}
      >
        {roles.map(option => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
      <Button
        type="submit"
        variant="outlined"
        startIcon={<PersonAdd />}
        disabled={busy || !trimmed}
        sx={{ borderRadius: 2, mt: 0.25 }}
      >
        Add
      </Button>
    </Box>
  );
};

export default AddMemberForm;
