import React, { useEffect, useState } from 'react';
import { Autocomplete, Avatar, Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { ArrowDownward, ArrowUpward, Close, PersonAdd } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '@visin/frontend-core';
import { paperService } from '../../services/paperService';
import { newAuthorDraft, type AuthorDraft } from './authorDraft';

const MIN_QUERY = 2;

/** Finds people with a public page by the start of their handle or name, as they type. */
function PersonPicker({ value, onChange, label }: { value: AuthorDraft['person']; onChange: (person: AuthorDraft['person']) => void; label: string }) {
  const [input, setInput] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTyped(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);
  const found = useQuery({
    queryKey: ['people-search', typed],
    queryFn: () => paperService.searchPeople(typed),
    enabled: typed.length >= MIN_QUERY
  });
  const options = found.data ?? [];
  return (
    <Autocomplete
      size="small"
      sx={{ flex: 1, minWidth: 0 }}
      value={value ?? null}
      options={value && !options.some((option) => option.id === value.id) ? [value, ...options] : options}
      loading={found.isFetching}
      filterOptions={(all) => all}
      isOptionEqualToValue={(option, chosen) => option.id === chosen.id}
      getOptionLabel={(person) => (person.handle ? `${person.name} (@${person.handle})` : person.name || 'Linked account')}
      onInputChange={(_event, next) => setInput(next)}
      onChange={(_event, person) => onChange(person ?? undefined)}
      noOptionsText={typed.length < MIN_QUERY ? 'Type a name or handle' : 'Nobody with a public page matches'}
      renderOption={(props, person) => (
        <Box component="li" {...props} key={person.id} sx={{ display: 'flex', gap: 1.5 }}>
          <Avatar src={person.picture} alt="" sx={{ width: 28, height: 28 }} slotProps={{ img: { referrerPolicy: 'no-referrer' } }}>
            {person.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="body2">{person.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              @{person.handle}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Link to a Visin account (optional)" />}
    />
  );
}

interface AuthorsEditorProps {
  value: AuthorDraft[];
  onChange: (next: AuthorDraft[]) => void;
  user: AuthUser | null;
  disabled?: boolean;
}

const helper = (author: AuthorDraft, userId: string | undefined): string | undefined => {
  if (!author.person) return undefined;
  if (author.person.id === userId) return 'That is you: confirmed.';
  return author.status === 'confirmed' ? 'Confirmed by them.' : 'They will be asked to confirm before it shows on their page.';
};

/**
 * The author list in the order the paper prints it. Each name may be linked to a Visin account, which is how a paper
 * reaches its authors' pages; a link to anyone but yourself stays unconfirmed until they say yes.
 */
const AuthorsEditor: React.FC<AuthorsEditorProps> = ({ value, onChange, user, disabled }) => {
  const update = (key: string, fields: Partial<AuthorDraft>) => onChange(value.map((author) => (author.key === key ? { ...author, ...fields } : author)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...value];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  const linkedSelf = value.some((author) => author.person?.id === user?.id);

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="subtitle2">Authors</Typography>
      {value.map((author, index) => (
        <Box key={author.key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            label={`Author ${index + 1}`}
            value={author.name}
            disabled={disabled}
            onChange={(event) => update(author.key, { name: event.target.value })}
            sx={{ flex: 1, minWidth: 0 }}
            slotProps={{ htmlInput: { maxLength: 120 } }}
            helperText=" "
          />
          <Box sx={{ flex: 1.2, minWidth: 0 }}>
            <PersonPicker
              label={`Account for author ${index + 1}`}
              value={author.person}
              onChange={(person) => update(author.key, { person, status: undefined })}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', minHeight: 20, px: 1.75, pt: 0.25 }}>
              {helper(author, user?.id)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexShrink: 0 }}>
            <IconButton aria-label={`Move author ${index + 1} up`} size="small" disabled={disabled || index === 0} onClick={() => move(index, -1)}>
              <ArrowUpward fontSize="small" />
            </IconButton>
            <IconButton aria-label={`Move author ${index + 1} down`} size="small" disabled={disabled || index === value.length - 1} onClick={() => move(index, 1)}>
              <ArrowDownward fontSize="small" />
            </IconButton>
            <IconButton aria-label={`Remove author ${index + 1}`} size="small" disabled={disabled || value.length === 1} onClick={() => onChange(value.filter((other) => other.key !== author.key))}>
              <Close fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<PersonAdd />} disabled={disabled || value.length >= 50} onClick={() => onChange([...value, newAuthorDraft()])}>
          Add author
        </Button>
        {user && !linkedSelf && (
          <Button
            size="small"
            disabled={disabled || value.length >= 50}
            onClick={() => {
              const me = { id: user.id, handle: user.username ?? '', name: user.name, picture: user.picture };
              const blank = value.findIndex((author) => !author.name.trim() && !author.person);
              const mine = newAuthorDraft({ name: user.name, person: me, status: 'confirmed' });
              onChange(blank >= 0 ? value.map((author, index) => (index === blank ? mine : author)) : [...value, mine]);
            }}
          >
            Add me
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default AuthorsEditor;
