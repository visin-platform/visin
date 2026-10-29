import { useState, FormEvent } from 'react';
import { Box, Dialog, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText, TextField, Typography } from '@mui/material';
import { Search } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { AppLayoutRecent } from './types';

export const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

interface SearchDialogProps {
  open: boolean;
  placeholder: string;
  recent: AppLayoutRecent[];
  onClose: () => void;
  onSubmit: (query: string) => void;
}

export function SearchDialog({ open, placeholder, recent, onClose, onSubmit }: SearchDialogProps) {
  const [query, setQuery] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setQuery('');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { xs: 2, sm: 10 }, borderRadius: 3 } } }}
    >
      <Box component="form" role="search" onSubmit={submit} sx={{ p: 1.5 }}>
        <TextField
          autoFocus
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          slotProps={{
            htmlInput: { 'aria-label': 'Search' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              )
            }
          }}
        />
        {!query.trim() && recent.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography
              id="search-recent"
              component="h2"
              sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', px: 1, mb: 0.5 }}
            >
              Recently visited
            </Typography>
            <List dense aria-labelledby="search-recent" disablePadding>
              {recent.map((place) => (
                <ListItemButton key={place.key} component={Link} to={place.path} onClick={onClose} sx={{ borderRadius: 2 }}>
                  {place.icon && <ListItemIcon sx={{ minWidth: 36 }}>{place.icon}</ListItemIcon>}
                  <ListItemText primary={place.text} secondary={place.secondary} slotProps={{ primary: { noWrap: true } }} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}
