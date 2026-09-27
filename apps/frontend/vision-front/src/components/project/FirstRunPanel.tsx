import React, { useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from '@mui/material';
import { Close as CloseIcon, PlayArrow as PlayArrowIcon, Key as KeyIcon, School as SchoolIcon } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { visionApi } from '../../config/visionApi';
import { pipelineEnv } from '../../utils/pipelineEnv';
import { curlSnippet, pythonSnippet } from '../../utils/firstRunSnippets';
import { SAMPLE_EPOCHS, SAMPLE_TAG, sendSampleRun, startSampleRun, type SampleRunProgress } from '../../utils/sampleRun';
import CreatePipelineKeyDialog from './CreatePipelineKeyDialog';
import CodeSnippet from './CodeSnippet';

interface FirstRunPanelProps {
  project: { _id: string; slug?: string; name: string };
}

interface FirstRun {
  run?: { _id: string; name: string };
  /** whether this panel has seen the project with no real run: only then does an arrival get announced */
  sawEmpty: boolean;
}

/**
 * "Send your first run": shown on a project that has no real run yet (the
 * onboarding sample does not count), to anyone who can write to it.
 *
 * Two steps. **See it work** sends the docs quickstart's run from the browser,
 * with the signed-in session, and opens it with a short tour. **Connect your
 * script** makes a pipeline key and shows the code to run, then waits for the
 * first real run and says when it arrives. It is shown from data alone, the
 * same on every device: a real run arriving in the project ends it. After
 * that, a small "First-run tutorial" button brings it back (`?tutorial=1`).
 */
const FirstRunPanel: React.FC<FirstRunPanelProps> = ({ project }) => {
  const navigate = useNavigate();
  // `?tutorial=1` brings the guide back on a project that already has runs;
  // it lives in the URL only, so nothing is remembered anywhere.
  const [searchParams, setSearchParams] = useSearchParams();
  const reopened = searchParams.get('tutorial') === '1';
  const setReopened = (open: boolean) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (open) next.set('tutorial', '1');
        else next.delete('tutorial');
        return next;
      },
      { replace: true }
    );
  const queryClient = useQueryClient();
  const projectId = project._id;
  const queryKey = ['first-real-run', projectId];
  const [progress, setProgress] = useState<SampleRunProgress | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [language, setLanguage] = useState<'python' | 'curl'>('python');

  const firstRun = useQuery({
    queryKey,
    queryFn: async (): Promise<FirstRun> => {
      const response = await visionApi.get('/trainings', { params: { projectId, excludeTags: SAMPLE_TAG, limit: 1 } });
      const run = (response.data as { data: { trainings: { _id: string; name: string }[] } }).data.trainings[0];
      const previous = queryClient.getQueryData<FirstRun>(queryKey);
      return { run, sawEmpty: Boolean(previous?.sawEmpty) || !run };
    },
    // Waiting for the script: a run shows up here within a few seconds of arriving.
    refetchInterval: (query) => (query.state.data?.run ? false : 5000)
  });

  const sample = useMutation({
    mutationFn: () => sendSampleRun(projectId, progress ?? startSampleRun(), setProgress),
    onSuccess: (done) => {
      navigate(`/trainings/${done.trainingId}?guide=sample`);
    }
  });

  const state = firstRun.data;
  // A project that already had a real run when the panel looked needs no panel.
  if (!state) return null;
  // Arrived while this panel was watching: announce it. Already there before: offer the tutorial again.
  const arrived = Boolean(state.run && state.sawEmpty);
  if (state.run && !state.sawEmpty && !reopened) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button size="small" startIcon={<SchoolIcon />} onClick={() => setReopened(true)}>
          First-run tutorial
        </Button>
      </Box>
    );
  }

  const projectRef = project.slug || projectId;
  const envLines = pipelineEnv(token ?? 'vsn_live_…');
  const sending = sample.isPending;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3, borderRadius: 2 }} aria-label="Send your first run" component="section">
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h6" component="h2">
            Send your first run
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Runs come from your training script. See what one looks like first, then connect yours.
          </Typography>
        </Box>
        {reopened && (
          <Tooltip title="Close">
            <IconButton onClick={() => setReopened(false)} aria-label="Close tutorial" size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {arrived && state.run ? (
        <Alert
          severity="success"
          action={
            <Button component={RouterLink} to={`/trainings/${state.run._id}`} color="inherit" size="small">
              Open it
            </Button>
          }
        >
          Your first run arrived: {state.run.name}
        </Alert>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              1. See it work
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              Send a sample run of {SAMPLE_EPOCHS} made-up epochs to this project and take a short tour of it. You can
              delete it afterwards.
            </Typography>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() => sample.mutate()}
              disabled={sending}
            >
              {sample.isError ? 'Try again' : 'Send a sample run'}
            </Button>
            {sending && (
              <Box sx={{ mt: 1.5, maxWidth: 360 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {progress?.trainingId ? `Sending epoch ${Math.min((progress.sent ?? 0) + 1, SAMPLE_EPOCHS)} of ${SAMPLE_EPOCHS}…` : 'Starting the run…'}
                </Typography>
                <LinearProgress variant="determinate" value={((progress?.sent ?? 0) / SAMPLE_EPOCHS) * 100} />
              </Box>
            )}
            {sample.isError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {sample.error.message}. Trying again carries on from where it stopped.
              </Alert>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              2. Connect your script
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              A pipeline key lets your script send runs to this project and nowhere else.
            </Typography>
            <Button variant="outlined" startIcon={<KeyIcon />} onClick={() => setKeyDialogOpen(true)} sx={{ mb: 2 }}>
              {token ? 'Create another pipeline key' : 'Create a pipeline key'}
            </Button>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Where your script runs:
            </Typography>
            <Box sx={{ mb: 2 }}>
              <CodeSnippet
                label="setup commands"
                code={`${language === 'python' ? 'pip install visin\n' : ''}${envLines}`}
              />
            </Box>
            <Tabs value={language} onChange={(_event, value) => setLanguage(value)} aria-label="Language" sx={{ mb: 1, minHeight: 36 }}>
              <Tab value="python" label="Python" sx={{ minHeight: 36, textTransform: 'none' }} />
              <Tab value="curl" label="curl" sx={{ minHeight: 36, textTransform: 'none' }} />
            </Tabs>
            <CodeSnippet
              label={language === 'python' ? 'Python example' : 'curl example'}
              code={language === 'python' ? pythonSnippet(projectRef) : curlSnippet(projectId)}
            />
            {!state.run && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, color: 'text.secondary' }} role="status">
                <CircularProgress size={14} color="inherit" />
                <Typography variant="body2">Waiting for your first run…</Typography>
              </Box>
            )}
          </Box>
        </Stack>
      )}

      <CreatePipelineKeyDialog projectId={projectId} open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} onCreated={setToken} />
    </Paper>
  );
};

export default FirstRunPanel;
