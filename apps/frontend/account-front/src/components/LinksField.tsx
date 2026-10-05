import React from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import { MAX_LINKS } from './tabs/publicProfile';

/** What the service expands to a full address on save; anything else is kept as the address it is. */
const SHORTHANDS =
  'github:name, linkedin:name, orcid:0000-0002-1825-0097, scholar:id, hf:name, kaggle:name, gitlab:name, x:name, bluesky:name.bsky.social, youtube:@name, researchgate:name, mastodon:@name@server';

interface LinksFieldProps {
  /** One entry per box, as typed (blank ones included); the service makes them https addresses on save. */
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  /** Example entries, shown in the empty boxes in turn. */
  examples: string[];
}

/**
 * The links of a public page (a person's, a group's): a box for each, with a way to add another and to remove one.
 * Each may be an address, a domain or a shorthand. There is always at least one box, so the way to start is plain.
 */
const LinksField: React.FC<LinksFieldProps> = ({ value, onChange, disabled, examples }) => {
  const rows = value.length > 0 ? value : [''];
  const set = (index: number, text: string) => onChange(rows.map((row, at) => (at === index ? text : row)));
  const remove = (index: number) => onChange(rows.filter((_, at) => at !== index));

  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Typography component="legend" variant="body2" sx={{ color: 'text.secondary', mb: 1, p: 0 }}>
        Links
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((row, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              fullWidth
              size="small"
              value={row}
              disabled={disabled}
              placeholder={examples[index % examples.length]}
              onChange={(event) => set(index, event.target.value)}
              slotProps={{
                htmlInput: { 'aria-label': `Link ${index + 1}`, maxLength: 300, autoCapitalize: 'none', spellCheck: false }
              }}
            />
            {/* The only box left has nothing to remove but what is typed in it. */}
            <IconButton
              size="small"
              aria-label={`Remove link ${index + 1}`}
              disabled={disabled || (rows.length === 1 && row === '')}
              onClick={() => remove(index)}
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Box>
      <Button
        size="small"
        startIcon={<Add />}
        disabled={disabled || rows.length >= MAX_LINKS}
        onClick={() => onChange([...rows, ''])}
        sx={{ mt: 1 }}
      >
        Add link
      </Button>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
        {rows.length >= MAX_LINKS ? `That is the most (${MAX_LINKS}). ` : `Up to ${MAX_LINKS}. `}
        Each can be an https:// address, a domain like example.com, or a shorthand. Shorthands: {SHORTHANDS}.
      </Typography>
    </Box>
  );
};

export default LinksField;
