import { Science, ScienceOutlined } from '@mui/icons-material';
import { IconButton, Tooltip } from '@mui/material';
import { useEffect, useState } from 'react';
import { getRunAlerts, setRunAlerts } from '../../services/runAlerts';

/**
 * Next to the notification bell once it is on: whether a finished or failed run of yours is announced too. Shown only
 * when the person's setting is known, so a failed read never offers a switch that would act on a guess.
 */
export function RunAlertsToggle() {
  const [on, setOn] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    getRunAlerts().then(
      (runs) => alive && setOn(runs),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, []);
  if (on === undefined) return null;
  const toggle = () => {
    setBusy(true);
    setRunAlerts(!on)
      .then(setOn, () => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <Tooltip title={on ? 'Run alerts are on: you are told when a run finishes or fails' : 'Get notified when a run finishes or fails'} arrow>
      <span>
        <IconButton
          size="small"
          aria-label={on ? 'Turn off run alerts' : 'Turn on run alerts'}
          aria-pressed={on}
          disabled={busy}
          onClick={toggle}
          color={on ? 'primary' : 'default'}
        >
          {on ? <Science fontSize="small" /> : <ScienceOutlined fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
