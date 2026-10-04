import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { evaluationService, suiteService } from '../../services/evaluationService';
import { trainingService } from '../../services/trainingService';
import type { Checkpoint, Evaluation, Suite } from '../../types/evaluation';
import { checkpointFormComplete, checkpointForms, modelLinkCheckpoints } from './checkpointForms';
import { checkpointLabel } from './sources';

interface PromoteDialogProps {
  /** the evaluation to copy onto the suite: it is not changed */
  evaluationId: string;
  /** the run and epoch the result came from, which is where evidence for its checkpoint would be */
  source?: { trainingId?: string; epoch?: number };
  onClose: () => void;
  onPromoted: (evaluation: Evaluation) => void;
}

const suiteRef = (suite: Suite) => `${suite.slug}@${suite.version}`;

/**
 * Rank a result recorded without a suite by copying it onto one. Such a result never said which checkpoint it was or how
 * many samples each condition scored, so the person promoting supplies both, and the form asks rather than
 * guessing: the suite's own counts are shown as the expectation, never filled in.
 */
const PromoteDialog: React.FC<PromoteDialogProps> = ({ evaluationId, source, onClose, onPromoted }) => {
  const queryClient = useQueryClient();
  const [suite, setSuite] = useState('');
  const [kind, setKind] = useState<Checkpoint['kind']>('local');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});

  const [linkId, setLinkId] = useState('');
  const prefilled = useRef(false);

  const run = useQuery({
    queryKey: ['training', source?.trainingId],
    queryFn: async () => (await trainingService.getTrainingById(source!.trainingId!)).data,
    enabled: Boolean(source?.trainingId) && source?.epoch !== undefined
  });
  // Only the links the run made at this very epoch are evidence for this result's checkpoint: never the run's best
  // or its latest, and never one that names no epoch.
  const evidenced = (run.data?.models ?? []).filter(link => link.epoch === source?.epoch);

  const choose = (link: (typeof evidenced)[number]) => {
    const stands = modelLinkCheckpoints[link.provider];
    setLinkId(link._id);
    setKind(stands.kind);
    setAnswers(previous => ({ ...previous, ...stands.answers(link) }));
  };
  useEffect(() => {
    if (prefilled.current || evidenced.length !== 1) return;
    prefilled.current = true;
    choose(evidenced[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the run's links first arrive
  }, [evidenced.length]);

  const suites = useQuery({ queryKey: ['suites', 'promote'], queryFn: () => suiteService.list({ limit: 100 }) });
  const chosen = suites.data?.suites.find(item => suiteRef(item) === suite);

  const checkpoint: Checkpoint = checkpointForms[kind].build(answers);
  const sampleCounts = Object.fromEntries(
    (chosen?.protocol.conditions ?? []).flatMap(condition => (counts[condition.name]?.trim() ? [[condition.name, Number(counts[condition.name])]] : []))
  );

  const promote = useMutation({
    mutationFn: () => evaluationService.promote({ evaluationId, suite, checkpoint, sampleCounts }),
    onSuccess: evaluation => {
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      onPromoted(evaluation);
    }
  });

  const complete =
    Boolean(chosen) &&
    Object.keys(sampleCounts).length === chosen!.protocol.conditions.length &&
    checkpointFormComplete(kind, answers);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Rank this result on a suite</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This copies the result onto the suite and leaves the original as it is. It did not record which checkpoint it was
          or how many samples each condition scored, so say here; what you enter is yours to vouch for.
        </DialogContentText>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField select label="Suite" value={suite} onChange={event => { setSuite(event.target.value); setCounts({}); }} size="small" required>
            {(suites.data?.suites ?? []).filter(item => !item.archivedAt).map(item => (
              <MenuItem key={item._id} value={suiteRef(item)}>{suiteRef(item)} · {item.name}</MenuItem>
            ))}
          </TextField>

          {evidenced.length > 0 && (
            <Box role="group" aria-label="Checkpoints this run linked at this epoch">
              <Alert severity={linkId ? 'success' : 'info'} sx={{ mb: 1 }}>
                {evidenced.length === 1
                  ? `This run linked this checkpoint at epoch ${source?.epoch}, so it is filled in below. Check it is the one that was tested.`
                  : `This run linked ${evidenced.length} checkpoints at epoch ${source?.epoch}. Choose the one that was tested.`}
              </Alert>
              <RadioGroup value={linkId} onChange={(_event, id) => { const link = evidenced.find(item => item._id === id); if (link) choose(link); }}>
                {evidenced.map(link => (
                  <FormControlLabel key={link._id} value={link._id} control={<Radio size="small" />} label={checkpointLabel(modelLinkCheckpoints[link.provider].checkpoint(link))} />
                ))}
              </RadioGroup>
            </Box>
          )}
          <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_event, next) => next && setKind(next)} aria-label="Where the checkpoint is">
            {Object.entries(checkpointForms).map(([value, form]) => (
              <ToggleButton key={value} value={value}>{form.choice}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          {checkpointForms[kind].fields.map(field => (
            <TextField
              key={field.key}
              label={field.label}
              value={answers[field.key] ?? ''}
              onChange={event => setAnswers(previous => ({ ...previous, [field.key]: event.target.value }))}
              size="small"
              required={field.required}
              placeholder={field.placeholder}
              helperText={field.helperText}
            />
          ))}

          {chosen?.protocol.conditions.map(condition => (
            <TextField
              key={condition.name}
              label={`Samples scored in “${condition.name}”`}
              type="number"
              size="small"
              required
              value={counts[condition.name] ?? ''}
              onChange={event => setCounts(previous => ({ ...previous, [condition.name]: event.target.value }))}
              helperText={`The suite expects ${condition.sampleCount}.`}
            />
          ))}
          {promote.isError && <Alert severity="error">{promote.error instanceof Error ? promote.error.message : 'Failed to promote'}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => promote.mutate()} disabled={!complete || promote.isPending}>Rank it</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PromoteDialog;
