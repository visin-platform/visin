import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { ConfirmDialog, Loader, OwnerChip, ResponsiveActions, useChartColors, type OwnerRole, type ResponsiveAction } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import ExportDialog from '../components/ExportDialog';
import ImportDialog from '../components/ImportDialog';
import ModelClassMappingDialog from '../components/ModelClassMappingDialog';
import {
  JobAction,
  deleteJob,
  downloadExport,
  getJob,
  getJobStats,
  getMyGroups,
  transitionJob,
  setJobVisibility
} from '../services/jobService';
import { usePageTitle } from '../hooks/usePageTitle';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
  draft: 'default',
  active: 'success',
  paused: 'warning',
  completed: 'info',
  archived: 'default'
};

const JobDetailPage: React.FC = () => {
  const { id: jobId = '' } = useParams();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { adapt } = useChartColors();
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [modelMappingOpen, setModelMappingOpen] = useState(false);

  const { data: job, isLoading, error: jobError } = useQuery({ queryKey: ['job', jobId], queryFn: () => getJob(jobId) });
  usePageTitle(job ? `${job.name} - Labeling` : 'Job - Labeling');
  const { data: stats } = useQuery({ queryKey: ['job-stats', jobId], queryFn: () => getJobStats(jobId) });
  // Running the job is managing its dataset; the server says which it is for this caller.
  const isAdmin = Boolean(job?.canManage);
  // Names the dataset's owning group on its chip.
  const { data: groups } = useQuery({ queryKey: ['my-groups'], queryFn: getMyGroups, enabled: isAuthenticated });
  const ownerGroups = (groups || []).map((group) => ({ id: group.groupId, name: group.name, role: group.role as OwnerRole }));

  const transition = useMutation({
    mutationFn: (action: JobAction) => transitionJob(jobId, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job', jobId] }),
    onError: (err) => setActionError((err as Error).message)
  });

  const remove = useMutation({
    mutationFn: () => deleteJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate('/jobs');
    }
    // A refusal is shown in the dialog that asked, where the person is looking.
  });

  const visibility = useMutation({
    mutationFn: (isPublic: boolean) => setJobVisibility(jobId, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (err) => setActionError((err as Error).message)
  });

  // Nothing below this is recoverable, and the labels are the labeling effort
  // itself — so the count goes in the prompt rather than a bare "are you sure".
  const confirmDelete = (): void => {
    remove.reset();
    setDeleteOpen(true);
  };
  const collected = job?.progress?.completed ?? 0;
  const deleteWarning = collected > 0 ? `, its masks and the labels on ${collected} frame(s)` : '';

  if (jobError) return <Alert severity="error">{jobError.message}</Alert>;
  if (isLoading || !job) {
    return <Loader message="Loading job..." />;
  }

  const progress = job.progress;
  const completion = progress && progress.tasks > 0 ? (progress.completed / progress.tasks) * 100 : 0;
  const exportManifest = () => downloadExport(jobId, 'manifest').catch((err) => setActionError(err.message));

  const labelingActions: ResponsiveAction[] = [
    ...(job.status === 'active' && isAuthenticated && job.canLabel
      ? [{ label: 'Start labeling', to: `/jobs/${jobId}/work`, primary: true }]
      : []),
    // Reviewing what has been labeled so far is the point of a shared link, so
    // it stands on its own rather than behind "start labeling".
    ...(job.tasksCount > 0
      ? [{ label: 'Browse frames', to: `/jobs/${jobId}/work?browse=1`, primary: !(job.status === 'active' && isAuthenticated) }]
      : []),
    ...(isAdmin && job.status === 'draft' ? [{ label: 'Activate', onClick: () => transition.mutate('activate') }] : []),
    ...(isAdmin && job.status === 'active' ? [{ label: 'Pause', onClick: () => transition.mutate('pause') }] : []),
    ...(isAdmin && job.status === 'paused' ? [{ label: 'Resume', onClick: () => transition.mutate('resume') }] : [])
  ];

  const adminActions: ResponsiveAction[] = isAdmin
    ? [
        ...(job.status !== 'archived' ? [{ label: 'Archive', onClick: () => transition.mutate('archive') }] : []),
        {
          label: job.isPublic ? 'Stop public sharing' : 'Enable public sharing',
          onClick: () => visibility.mutate(!job.isPublic),
          disabled: visibility.isPending
        },
        { label: 'Export labels…', onClick: () => setExportOpen(true) },
        { label: 'Model class mapping…', onClick: () => setModelMappingOpen(true) },
        ...(job.tasksCount > 0 && job.status !== 'archived' ? [{ label: 'Import labels…', onClick: () => setImportOpen(true) }] : []),
        // The classes, sensors and sampling spec the labels were made under.
        { label: 'Export job setup', onClick: exportManifest },
        { label: 'Delete', onClick: confirmDelete, disabled: remove.isPending, danger: true }
      ]
    : [];

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: '16px' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
          {job.name}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
          <Chip label={job.status} color={STATUS_COLORS[job.status]} size="small" sx={{ textTransform: 'capitalize' }} />
          <Chip label={job.isPublic ? 'Public sharing enabled' : 'Private'} size="small" />
          {job.dataset && (
            <>
              <Chip label={`Dataset: ${job.dataset.name}`} size="small" variant="outlined" />
              <OwnerChip owner={job.dataset.owner} userId={user?.id} groups={ownerGroups} />
            </>
          )}
          <Chip label={job.sensors.map((sensor) => sensor.key).join(' + ')} size="small" variant="outlined" />
          {job.redundancy > 1 && <Chip label={`K=${job.redundancy}`} size="small" variant="outlined" />}
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }} aria-label="classes">
          {job.classes.map((entry) => (
            <Chip
              key={entry.key}
              size="small"
              label={`${entry.name} · ${entry.tools.join(' + ')}`}
              icon={<Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: adapt(entry.color), ml: '8px !important' }} />}
            />
          ))}
        </Stack>
        {job.description && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {job.description}
          </Typography>
        )}

        {progress && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {progress.completed}/{progress.tasks} frames complete · {progress.skipped} skipped · {progress.myDone} by me
            </Typography>
            <LinearProgress variant="determinate" value={completion} sx={{ mt: 1 }} />
          </Box>
        )}

        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)} sx={{ mt: 2 }}>
            {actionError}
          </Alert>
        )}

        {/* What the job is for stays in reach; the admin chores — archive,
            sharing, exports, delete — sit behind ⋮ so they cannot crowd it out. */}
        <Box sx={{ mt: 2 }}>
          <ResponsiveActions
            keepOnPhone={labelingActions.length}
            keepOnDesktop={labelingActions.length}
            menuLabel={`More actions for ${job.name}`}
            actions={[...labelingActions, ...adminActions]}
          />
        </Box>
        {isAdmin && <Typography variant="body2" sx={{ mt: 2 }}>
          Public sharing lets anyone view an active job, its frames, and anonymous results.
          Turning it off stops new image links; links already issued expire within one hour.
        </Typography>}
      </Paper>

      <ExportDialog open={exportOpen} jobId={jobId} classes={job.classes} onClose={() => setExportOpen(false)} />
      {isAdmin && modelMappingOpen && <ModelClassMappingDialog jobId={jobId} classes={job.classes} onClose={() => setModelMappingOpen(false)} />}
      <ImportDialog open={importOpen} jobId={jobId} classes={job.classes} onClose={() => setImportOpen(false)} />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this job?"
        confirmLabel="Delete job"
        busyLabel="Deleting..."
        busy={remove.isPending}
        error={remove.error ? (remove.error as Error).message : null}
        onConfirm={() => remove.mutate()}
        onCancel={() => setDeleteOpen(false)}
      >
        Delete "{job.name}"? This removes the job, its frames{deleteWarning}. Export first — this cannot be undone.
      </ConfirmDialog>

      {stats && (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: '16px' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Progress
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {stats.completed}/{stats.tasks} frames complete · {stats.objects.toLocaleString()} boxes drawn
          </Typography>

          {stats.perClass.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Per class
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell align="right">Boxes</TableCell>
                    <TableCell align="right">Mask pixels</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.perClass.map((entry) => (
                    <TableRow key={entry.classKey}>
                      <TableCell>{entry.name}</TableCell>
                      <TableCell align="right">{entry.boxes.toLocaleString()}</TableCell>
                      <TableCell align="right">{entry.pixels.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}

          {/* Absent, rather than empty, for an anonymous viewer: the breakdown
              is a list of labelers' email addresses. */}
          {stats.perUser && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Per annotator
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Annotator</TableCell>
                    <TableCell align="right">Done</TableCell>
                    <TableCell align="right">Skipped</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.perUser.map((user) => (
                    <TableRow key={user.userEmail}>
                      <TableCell>{user.userName || user.userEmail}</TableCell>
                      <TableCell align="right">{user.done}</TableCell>
                      <TableCell align="right">{user.skipped}</TableCell>
                    </TableRow>
                  ))}
                  {stats.perUser.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} sx={{ color: 'text.secondary' }}>
                        No labels yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}

          {stats.perStratum.length > 1 && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Per stratum
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Stratum</TableCell>
                    <TableCell align="right">Frames</TableCell>
                    <TableCell align="right">Complete</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.perStratum.map((stratum) => (
                    <TableRow key={stratum.stratum}>
                      <TableCell>{stratum.stratum}</TableCell>
                      <TableCell align="right">{stratum.tasks}</TableCell>
                      <TableCell align="right">{stratum.completed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Paper>
      )}
    </Stack>
  );
};

export default JobDetailPage;
