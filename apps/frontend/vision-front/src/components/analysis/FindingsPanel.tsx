import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { AutoAwesome, Delete, Person, PostAdd } from '@mui/icons-material';
import { useCreateFinding, useDeleteFinding, useFindings } from '../../hooks/useFindings';
import { Finding } from '../../types/finding';

interface FindingsPanelProps {
  /** Always required: findings hang off a project, and access follows it. */
  projectId: string;
  /**
   * Narrow to one run.
   *
   * When set, the listing shows findings about this run *or citing it* — a
   * comparative conclusion drawn from a dozen runs surfaces from any of them —
   * and anything written here is attributed to the run as well as the project.
   */
  trainingId?: string;
  isOwner: boolean;
}

const formatDate = (value: string): string => new Date(value).toLocaleDateString();

/**
 * One recorded conclusion.
 *
 * Who wrote it is shown, never implied. A reader deciding how much weight to
 * put on "window16 beats window24" needs to know whether a person concluded
 * that or an assistant did, and the cited runs are what lets them check either.
 */
const FindingCard: React.FC<{
  finding: Finding;
  canDelete: boolean;
  onDelete: () => void;
}> = ({ finding, canDelete, onDelete }) => (
  <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
          {finding.title}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Chip
            size="small"
            icon={finding.authorKind === 'assistant' ? <AutoAwesome /> : <Person />}
            label={finding.authorLabel}
            variant="outlined"
          />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {formatDate(finding.createdAt)}
          </Typography>
        </Stack>
      </Box>

      {canDelete && (
        <Tooltip title="Delete">
          <IconButton size="small" onClick={onDelete} aria-label={`Delete ${finding.title}`}>
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>

    <Typography
      variant="body2"
      sx={{ whiteSpace: 'pre-wrap', color: 'text.primary', lineHeight: 1.7 }}
    >
      {finding.body}
    </Typography>

    {finding.trainingIds.length > 0 && (
      <Typography variant="caption" sx={{ color: 'text.secondary', mt: 2, display: 'block' }}>
        Draws on {finding.trainingIds.length} run{finding.trainingIds.length === 1 ? '' : 's'}
      </Typography>
    )}
  </Paper>
);

const FindingsPanel: React.FC<FindingsPanelProps> = ({ projectId, trainingId, isOwner }) => {
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const findings = useFindings(trainingId ? { training: trainingId } : { project: projectId });
  const createFinding = useCreateFinding();
  const deleteFinding = useDeleteFinding();

  const busy = createFinding.isPending || deleteFinding.isPending;
  const mutationError = createFinding.error ?? deleteFinding.error;

  const close = () => {
    setComposing(false);
    setTitle('');
    setBody('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;

    createFinding.mutate(
      { project: projectId, training: trainingId, title: title.trim(), body: body.trim() },
      { onSuccess: close }
    );
  };

  return (
    <Box sx={{ px: 3, pb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            Analysis
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {trainingId
              ? 'Conclusions about this run, and comparative ones that cite it — by you, or by an assistant connected over MCP.'
              : 'Conclusions recorded about this project — by you, or by an assistant connected over MCP. What gets written here survives the conversation that produced it.'}
          </Typography>
        </Box>
        {isOwner && (
          <Button
            variant="contained"
            startIcon={<PostAdd />}
            onClick={() => setComposing(true)}
            sx={{ flexShrink: 0 }}
          >
            Add note
          </Button>
        )}
      </Box>

      {mutationError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {mutationError.message}
        </Alert>
      )}

      {findings.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : findings.error ? (
        <Alert severity="error">{findings.error.message}</Alert>
      ) : (findings.data?.length ?? 0) === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {trainingId
              ? 'Nothing recorded about this run yet. Ask a connected assistant to analyse it, or write a note yourself.'
              : 'Nothing recorded yet. Ask a connected assistant to analyse a run and record what it finds, or write a note yourself.'}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={2}>
          {findings.data?.map(finding => (
            <FindingCard
              key={finding._id}
              finding={finding}
              canDelete={isOwner && !busy}
              onDelete={() => deleteFinding.mutate(finding._id)}
            />
          ))}
        </Stack>
      )}

      <Dialog open={composing} onClose={close} fullWidth maxWidth="sm">
        <form onSubmit={submit}>
          <DialogTitle>Record a note</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Conclusion"
              placeholder="Window ablation plateaus past 16"
              value={title}
              disabled={createFinding.isPending}
              onChange={event => setTitle(event.target.value)}
              sx={{ mt: 1, mb: 2 }}
            />
            <TextField
              fullWidth
              multiline
              minRows={6}
              size="small"
              label="What you found"
              placeholder="State the evidence, not only the verdict."
              value={body}
              disabled={createFinding.isPending}
              onChange={event => setBody(event.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabled={createFinding.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createFinding.isPending || !title.trim() || !body.trim()}
            >
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default FindingsPanel;
