import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField } from '@mui/material';
import { api } from '../../services/apiClient';
import { projectIdentifier } from './projectIdentifier';

export interface PublicProject {
  id: string;
  name: string;
  /** The run the visitor's page shows, when it shows exactly one. */
  trainingId?: string;
}

/**
 * Which public project to ask about, found by name: the list of public projects, narrowed as the visitor types. A
 * pasted link to a project works too, for someone who already has one.
 */
export default function ProjectPicker({
  value,
  onChange,
  disabled,
  compact = false
}: {
  value: PublicProject | null;
  onChange: (project: PublicProject | null) => void;
  disabled?: boolean;
  /** One small line, for above a message box. */
  compact?: boolean;
}) {
  // What the box shows, and what the visitor typed into it: choosing a project fills the box with its name, which is
  // not a search for that name.
  const [shown, setShown] = useState('');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  const pasted = typed.includes('://') ? projectIdentifier(typed) : null;
  const found = useQuery({
    queryKey: ['guest-projects', pasted ? '' : search],
    queryFn: () => api<{ projects: PublicProject[] }>(`/guest/projects?q=${encodeURIComponent(search)}`),
    enabled: !pasted,
    staleTime: 60_000,
    retry: false
  });
  const options: PublicProject[] = pasted ? [{ id: pasted, name: `Project ${pasted}` }] : (found.data?.projects ?? []);
  return (
    <Autocomplete
      value={value}
      options={options}
      disabled={disabled}
      loading={found.isFetching}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      filterOptions={(all) => all}
      inputValue={shown}
      onInputChange={(_event, text, reason) => {
        setShown(text);
        if (reason === 'input') setTyped(text);
      }}
      onChange={(_event, project) => onChange(project)}
      noOptionsText={found.isError ? 'Projects cannot be listed right now' : 'No public project matches'}
      size={compact ? 'small' : 'medium'}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Public project"
          placeholder="Search by name, or paste a project link"
          helperText={compact ? undefined : "Vivi answers from the project's public page."}
        />
      )}
    />
  );
}
