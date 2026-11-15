import { useState } from 'react';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { useNewVersion } from '../hooks/useNewVersion';

/**
 * Offers a reload after a deploy instead of doing it: reloading would throw away a half-typed message. Later keeps
 * the running version until the next natural reload.
 */
export function UpdatePrompt() {
  const available = useNewVersion();
  const [dismissed, setDismissed] = useState(false);
  return (
    <Snackbar
      open={available && !dismissed}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message="A new version of Visin is ready"
      action={
        <>
          <Button color="secondary" size="small" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button color="inherit" size="small" onClick={() => setDismissed(true)}>
            Later
          </Button>
        </>
      }
      sx={{ mb: { xs: 9, sm: 2 } }}
    />
  );
}
