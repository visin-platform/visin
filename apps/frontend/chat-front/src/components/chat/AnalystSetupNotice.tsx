import { Alert, Button } from '@mui/material';
import { analystSettingsHref } from '../../utils/analystSettingsLink';

export function AnalystSetupNotice({ canConfigure }: { canConfigure: boolean }) {
  return (
    <Alert
      severity="info"
      action={
        canConfigure && (
          <Button color="inherit" size="small" component="a" href={analystSettingsHref()}>
            Set up
          </Button>
        )
      }
    >
      {canConfigure
        ? 'The analyst is not turned on yet.'
        : 'The analyst is not turned on for this deployment. Ask an administrator.'}
    </Alert>
  );
}
