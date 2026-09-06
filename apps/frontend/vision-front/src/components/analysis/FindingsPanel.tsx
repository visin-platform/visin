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
import { Article, AutoAwesome, Check, ContentCopy, Delete, Person, PostAdd, Science } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useCreateFinding, useDeleteFinding, useExportFinding, useFindings } from '../../hooks/useFindings';
import { Finding, FindingExport } from '../../types/finding';

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
  onExport: () => void;
  exporting: boolean;
}> = ({ finding, canDelete, onDelete, onExport, exporting }) => {
  // Cited but unnamed means the run sits in a project this reader cannot see —
  // or, briefly after a front-first deploy, that the API is not sending names
  // yet. Said plainly rather than dropped: a card silently listing two of three
  // runs misrepresents how much evidence the conclusion rests on.
  const cited = finding.citedTrainings ?? [];
  // Only claimed when something else did resolve. With no names at all the
  // cause is more likely an API that predates them than a whole citation list
  // the reader cannot see, and the card falls back to the bare count.
  const hiddenCitations = cited.length > 0 ? finding.trainingIds.length - cited.length : 0;

  return (
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

      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        <Tooltip title="Show as a LaTeX section, with a results table built from the cited runs">
          <span>
            <IconButton
              size="small"
              onClick={onExport}
              disabled={exporting}
              aria-label={`Export ${finding.title} as LaTeX`}
            >
              <Article fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {canDelete && (
          <Tooltip title="Delete">
            <IconButton size="small" onClick={onDelete} aria-label={`Delete ${finding.title}`}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>

    <Typography
      variant="body2"
      sx={{ whiteSpace: 'pre-wrap', color: 'text.primary', lineHeight: 1.7 }}
    >
      {finding.body}
    </Typography>

    {finding.recommendations && (
      <Box
        sx={{
          mt: 2.5,
          p: 2,
          borderRadius: 1.5,
          bgcolor: 'action.hover',
          borderLeft: 3,
          borderColor: 'primary.main'
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
          <Science fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.3 }}>
            SUGGESTED NEXT RUN
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
          {finding.recommendations}
        </Typography>
      </Box>
    )}

    {finding.trainingIds.length > 0 && (
      <Box sx={{ mt: 2.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
          Draws on {finding.trainingIds.length} run{finding.trainingIds.length === 1 ? '' : 's'}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {cited.map(run => (
            <Chip
              key={run._id}
              size="small"
              label={run.name}
              component={RouterLink}
              to={`/trainings/${run._id}`}
              clickable
              variant="outlined"
            />
          ))}
          {hiddenCitations > 0 && (
            <Tooltip title="These runs are in a project you cannot see">
              <Chip
                size="small"
                label={`${hiddenCitations} not visible to you`}
                variant="outlined"
                sx={{ color: 'text.secondary' }}
              />
            </Tooltip>
          )}
        </Stack>
      </Box>
    )}
  </Paper>
  );
};

/**
 * The generated LaTeX, to copy.
 *
 * Shown rather than downloaded because what people do with this is paste it
 * into a paper that is already open; a file in ~/Downloads is a detour on the
 * way there. It stays selectable text so copying by hand still works when the
 * clipboard API is unavailable — over plain HTTP, or with permission refused.
 */
const LatexDialog: React.FC<{ exported: FindingExport | null; onClose: () => void }> = ({
  exported,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!exported) return;
    try {
      await navigator.clipboard.writeText(exported.tex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing to report: the text is on screen and selectable, which is the
      // fallback. An error alert here would be louder than the problem.
    }
  };

  return (
    <Dialog open={exported !== null} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 1 }}>
        Paper section
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          A <code>\subsection</code> with the analysis and a results table. Every number in the
          table is read from the cited runs&apos; recorded epochs. Needs{' '}
          <code>\usepackage&#123;booktabs&#125;</code>.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 1.5,
            bgcolor: 'action.hover',
            fontFamily: 'monospace',
            fontSize: 13,
            lineHeight: 1.6,
            overflowX: 'auto',
            whiteSpace: 'pre',
            maxHeight: '55vh'
          }}
        >
          {exported?.tex}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={copied ? <Check /> : <ContentCopy />}
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const FindingsPanel: React.FC<FindingsPanelProps> = ({ projectId, trainingId, isOwner }) => {
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [exported, setExported] = useState<FindingExport | null>(null);

  const findings = useFindings(trainingId ? { training: trainingId } : { project: projectId });
  const createFinding = useCreateFinding();
  const deleteFinding = useDeleteFinding();
  const exportFinding = useExportFinding();

  const busy = createFinding.isPending || deleteFinding.isPending;
  const mutationError = createFinding.error ?? deleteFinding.error ?? exportFinding.error;

  const close = () => {
    setComposing(false);
    setTitle('');
    setBody('');
    setRecommendations('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;

    createFinding.mutate(
      {
        project: projectId,
        training: trainingId,
        title: title.trim(),
        body: body.trim(),
        recommendations: recommendations.trim() || undefined
      },
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
              onExport={() => exportFinding.mutate({ id: finding._id }, { onSuccess: setExported })}
              exporting={exportFinding.isPending}
            />
          ))}
        </Stack>
      )}

      <LatexDialog exported={exported} onClose={() => setExported(null)} />

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
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label="Suggested next run (optional)"
              placeholder="A setting and the value to try."
              helperText="Kept out of the paper export — it is written there as a comment."
              value={recommendations}
              disabled={createFinding.isPending}
              onChange={event => setRecommendations(event.target.value)}
              sx={{ mt: 2 }}
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
