import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, Link, Stack, Tooltip, Typography } from '@mui/material';
import { Close, RadioButtonUnchecked } from '@mui/icons-material';
import { panelSx } from './panel';

interface GetStartedProps {
  /** Whether account-front is loaded, for the link to its groups page. */
  hasAccountApp: boolean;
  /** Present when it was brought back on purpose; a newcomer's card has no close. */
  onClose?: () => void;
}

interface StepProps {
  n: number;
  title: string;
  children: React.ReactNode;
}

function Step({ n, title, children }: StepProps) {
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.5, listStyle: 'none' }}>
      <Box sx={{ pt: 0.25, color: 'text.disabled' }}>
        <RadioButtonUnchecked fontSize="small" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>
          {n}. {title}
        </Typography>
        <Box sx={{ color: 'text.secondary', typography: 'body2', mt: 0.25 }}>{children}</Box>
      </Box>
    </Box>
  );
}

/**
 * "Get started", on the home page of someone with no group and no project yet.
 *
 * Shown from data alone, so it looks the same on every device and needs no
 * "hide" to remember: joining a group or creating a project ends it. A small
 * "Getting started" button brings it back later (`?tutorial=1`). The
 * project then carries on with its own "Send your first run" guide, which has
 * the sample run, the pipeline key and the code.
 */
export function GetStarted({ hasAccountApp, onClose }: GetStartedProps) {
  return (
    <Box component="section" aria-labelledby="get-started" sx={{ ...panelSx, p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Typography id="get-started" component="h2" variant="h6">
          Get started
        </Typography>
        {onClose && (
          <Tooltip title="Close">
            <IconButton onClick={onClose} aria-label="Close getting started" size="small">
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Three steps to your first training run in Visin.
      </Typography>

      <Stack component="ol" spacing={2} sx={{ m: 0, p: 0 }}>
        <Step n={1} title="Your team">
          Working with others? Create a group or accept an invitation
          {hasAccountApp ? (
            <>
              {' '}under{' '}
              <Link component={RouterLink} to="/account/groups">
                Account → Groups
              </Link>
            </>
          ) : null}
          . Working alone is fine too.
        </Step>

        <Step n={2} title="Create a project">
          A project holds the training runs of one line of work.
          <Box sx={{ mt: 1 }}>
            <Button component={RouterLink} to="/projects?new=1" variant="contained" size="small">
              Create a project
            </Button>
          </Box>
        </Step>

        <Step n={3} title="Send your first run">
          Your new project shows how: a sample run you can send with one click, then how to connect your own script.
        </Step>
      </Stack>
    </Box>
  );
}
