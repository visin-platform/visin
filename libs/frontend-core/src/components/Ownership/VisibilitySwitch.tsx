import { FormControl, FormControlLabel, FormHelperText, FormLabel, Radio, RadioGroup } from '@mui/material';
import type { Visibility } from './types';

export interface VisibilitySwitchProps {
  value: Visibility;
  onChange: (visibility: Visibility) => void;
  /** whoever owns it may have it stay private but not make it public; they see why */
  canMakePublic?: boolean;
  disabled?: boolean;
}

/** Private to its owner, or readable by anyone, signed in or not. There is no level between. */
export function VisibilitySwitch({ value, onChange, canMakePublic = true, disabled }: VisibilitySwitchProps) {
  return (
    <FormControl disabled={disabled}>
      <FormLabel id="visibility-label">Who can see it</FormLabel>
      <RadioGroup row aria-labelledby="visibility-label" value={value} onChange={(event) => onChange(event.target.value as Visibility)}>
        <FormControlLabel value="private" control={<Radio />} label="Private" />
        <FormControlLabel value="public" control={<Radio />} label="Public" disabled={disabled || (!canMakePublic && value !== 'public')} />
      </RadioGroup>
      <FormHelperText>
        {value === 'public'
          ? 'Anyone can read it, even without signing in. Only its owner can change it.'
          : canMakePublic
            ? 'Only its owner, and the owning group’s members, can see it.'
            : 'Only its owner, and the owning group’s members, can see it. Only the owner can make it public.'}
      </FormHelperText>
    </FormControl>
  );
}
