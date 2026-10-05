import React from 'react';
import { MenuItem, Stack, TextField } from '@mui/material';
import { OTHER_LICENSE, type DataLicense } from '../../types/license';
import type { LicenseDraft } from '../../utils/licenseDraft';

interface LicenseFieldsProps {
  choices: DataLicense[];
  loading?: boolean;
  draft: LicenseDraft;
  credit: string;
  disabled?: boolean;
  onDraft: (draft: LicenseDraft) => void;
  onCredit: (credit: string) => void;
}

/**
 * What the data may be used for, as its publisher declares it. Visin shows the declaration and does not check it,
 * so leaving it empty is allowed and is shown as "not stated" rather than guessed.
 */
const LicenseFields: React.FC<LicenseFieldsProps> = ({ choices, loading, draft, credit, disabled, onDraft, onCredit }) => (
  <Stack spacing={2}>
    <TextField
      select
      label="Licence"
      value={draft.id}
      onChange={(event) => onDraft({ ...draft, id: event.target.value })}
      disabled={disabled || loading}
      helperText="What the data may be used for, as its owner states it. Visin shows this and does not check it."
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      <MenuItem value="">Not stated</MenuItem>
      {/* Until the list arrives the current choice still has to be an option, or the select shows nothing. */}
      {draft.id !== '' && !choices.some((choice) => choice.id === draft.id) && <MenuItem value={draft.id}>{draft.id}</MenuItem>}
      {choices.map((choice) => (
        <MenuItem key={choice.id} value={choice.id}>
          {choice.name}
        </MenuItem>
      ))}
    </TextField>
    {draft.id === OTHER_LICENSE && (
      <>
        <TextField
          label="Licence name"
          value={draft.name}
          onChange={(event) => onDraft({ ...draft, name: event.target.value })}
          disabled={disabled}
          required
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        <TextField
          label="Link to the licence"
          value={draft.url}
          onChange={(event) => onDraft({ ...draft, url: event.target.value })}
          disabled={disabled}
          placeholder="https://"
        />
      </>
    )}
    <TextField
      label="Credit"
      value={credit}
      onChange={(event) => onCredit(event.target.value)}
      disabled={disabled}
      multiline
      minRows={2}
      helperText="The attribution or citation the licence or the data's authors ask for"
      slotProps={{ htmlInput: { maxLength: 1000 } }}
    />
  </Stack>
);

export default LicenseFields;
