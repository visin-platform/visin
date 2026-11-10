import { NotificationsActive, NotificationsNone, NotificationsOff } from '@mui/icons-material';
import { CircularProgress, IconButton, Snackbar, Tooltip } from '@mui/material';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import type { PushSupport } from '../../services/pushNotifications';

/** Why the switch cannot be turned on, where it cannot. */
const BLOCKED: Partial<Record<PushSupport, string>> = {
  denied: 'Notifications are blocked for this site. Allow them in your browser’s settings, then try again.',
  'needs-install': 'On iPhone and iPad, add Visin to your Home Screen first, then turn notifications on from there.',
  insecure: 'Notifications need a secure (https) address. Open Visin over https, or on localhost.'
};

/** The bell in the conversation list: new messages and calls reach this device even with Visin closed. */
export function NotificationToggle() {
  const { available, support, on, busy, error, toggle } = usePushNotifications();
  const blocked = BLOCKED[support];
  if (!available) return null;
  const label = on ? 'Turn off notifications' : 'Turn on notifications';
  return (
    <>
      <Tooltip title={blocked ?? (on ? 'Notifications are on for this device' : 'Get notified of new messages')} arrow>
        {/* A disabled button swallows hover, so the tooltip sits on a wrapper. */}
        <span>
          <IconButton
            size="small"
            aria-label={blocked ? 'Notifications unavailable' : label}
            aria-pressed={on}
            disabled={busy}
            onClick={() => void (blocked ? undefined : toggle())}
            color={on ? 'primary' : 'default'}
          >
            {busy ? (
              <CircularProgress size={18} />
            ) : blocked ? (
              <NotificationsOff fontSize="small" />
            ) : on ? (
              <NotificationsActive fontSize="small" />
            ) : (
              <NotificationsNone fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Snackbar open={Boolean(error)} message={error} autoHideDuration={6000} />
    </>
  );
}
