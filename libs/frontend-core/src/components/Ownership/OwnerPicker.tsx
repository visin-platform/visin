import { MenuItem, TextField } from '@mui/material';
import { ownerLabel, type OwnerGroup, type OwnerRef } from './types';

export interface OwnerPickerProps {
  value: OwnerRef;
  onChange: (owner: OwnerRef) => void;
  userId: string;
  /** the signed-in user's groups; each is offered as an owner */
  groups: OwnerGroup[];
  disabled?: boolean;
  label?: string;
  helperText?: string;
}

const keyOf = (owner: OwnerRef) => `${owner.kind}:${owner.id}`;

/** Who a new project or dataset belongs to: the user, or one of their groups. */
export function OwnerPicker({ value, onChange, userId, groups, disabled, label = 'Owner', helperText }: OwnerPickerProps) {
  const options: OwnerRef[] = [{ kind: 'user', id: userId }, ...groups.map((group): OwnerRef => ({ kind: 'group', id: group.id }))];
  return (
    <TextField
      select
      size="small"
      label={label}
      value={keyOf(value)}
      disabled={disabled}
      helperText={helperText ?? (value.kind === 'group' ? "The group's roles decide who can do what with it." : 'Only you can see and change it, unless you make it public.')}
      onChange={(event) => {
        const chosen = options.find((option) => keyOf(option) === event.target.value);
        if (chosen) onChange(chosen);
      }}
      sx={{ minWidth: 220 }}
    >
      {options.map((option) => (
        <MenuItem key={keyOf(option)} value={keyOf(option)}>
          {ownerLabel(option, userId, groups)}
        </MenuItem>
      ))}
    </TextField>
  );
}
