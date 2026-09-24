import type { ReactNode } from 'react';
import { Alert, AlertTitle } from '@mui/material';

const SEVERITY = { note: 'info', tip: 'success', warning: 'warning' } as const;

interface CalloutProps {
  kind?: keyof typeof SEVERITY;
  title?: string;
  children: ReactNode;
}

/** The things people get wrong, set apart so a skimming reader still sees them. */
export default function Callout({ kind = 'note', title, children }: CalloutProps) {
  return (
    <Alert
      severity={SEVERITY[kind]}
      variant="outlined"
      sx={{
        my: 3,
        borderRadius: '12px',
        '& .MuiAlert-message > p': { m: 0 },
        '& .MuiAlert-message > p + p': { mt: 1 }
      }}
    >
      {title && <AlertTitle sx={{ fontWeight: 700 }}>{title}</AlertTitle>}
      {children}
    </Alert>
  );
}
