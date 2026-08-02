import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography
} from '@mui/material';
import { getMaskFields, listBundles } from '../services/bundleService';
import { createJob, getMyGroups, materializeJob, transitionJob } from '../services/jobService';
import { JobChoice, MaskSelector, MaterializeBody, MaterializeResult, TaskType } from '../types';

const STEPS = ['Basics', 'Question', 'Tasks', 'Activate'];

const DEFAULT_CHOICES: JobChoice[] = [
  { key: 'good', label: 'Good', hotkey: 'g' },
  { key: 'bad', label: 'Bad', hotkey: 'b' }
];

const NewJobPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: groups } = useQuery({ queryKey: ['my-groups'], queryFn: getMyGroups });
  const { data: bundles } = useQuery({ queryKey: ['bundles'], queryFn: listBundles });

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1 — basics
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [bundleId, setBundleId] = useState('');

  // Step 2 — question
  const [taskType, setTaskType] = useState<TaskType>('mask_toggle');
  const [prompt, setPrompt] = useState('Mark all incorrect masks');
  const [choices, setChoices] = useState<JobChoice[]>(DEFAULT_CHOICES);
  const [annotationSets, setAnnotationSets] = useState<string[]>([]);
  const [redundancy, setRedundancy] = useState(1);

  // Step 3 — tasks
  const [selectionKind, setSelectionKind] = useState<'manifest' | 'filter'>('manifest');
  const [manifestContent, setManifestContent] = useState('');
  const [manifestFormat, setManifestFormat] = useState<'csv' | 'jsonl'>('csv');
  const [sampleN, setSampleN] = useState<string>('');
  const [seed, setSeed] = useState<string>('42');
  const [maskField, setMaskField] = useState<string>('');
  const [maskValues, setMaskValues] = useState<string[]>([]);
  const [maskPerValue, setMaskPerValue] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [materialized, setMaterialized] = useState<MaterializeResult | null>(null);

  const adminGroups = (groups || []).filter((group) => group.role === 'owner' || group.role === 'admin');
  const groupBundles = (bundles || []).filter((bundle) => bundle.groupId === groupId && bundle.status === 'ready');
  const bundle = useMemo(() => groupBundles.find((candidate) => candidate._id === bundleId), [groupBundles, bundleId]);
  const bundleSets = bundle?.annotationSets || [];

  // Mask metadata is per annotation set, so the groupable fields only exist once
  // a set is picked — one full-corpus bundle can then be sliced per job.
  const maskSet = taskType === 'mask_toggle' ? annotationSets[0] : undefined;
  const { data: maskFields } = useQuery({
    queryKey: ['mask-fields', bundleId, maskSet],
    queryFn: () => getMaskFields(bundleId, maskSet!),
    enabled: Boolean(bundleId && maskSet)
  });
  const selectedField = (maskFields || []).find((entry) => entry.field === maskField);

  const toggleSet = (set: string) => {
    setAnnotationSets((previous) =>
      taskType === 'mask_toggle'
        ? [set] // exactly one set for mask verification
        : previous.includes(set)
          ? previous.filter((candidate) => candidate !== set)
          : [...previous, set]
    );
  };

  // A bundle with sets but none picked materializes tasks with no payload — the
  // workbench then shows the bare frame and there is nothing to judge, so block it.
  const stepValid = [
    Boolean(name.trim() && groupId && bundleId),
    Boolean(prompt.trim()) &&
      (taskType === 'mask_toggle'
        ? annotationSets.length === 1
        : choices.length >= 2 && (bundleSets.length === 0 || annotationSets.length >= 1)) &&
      redundancy >= 1,
    Boolean(materialized),
    true
  ][step];

  const createAndMaterialize = async () => {
    setBusy(true);
    setError(null);
    try {
      let id = jobId;
      if (!id) {
        const job = await createJob({
          name: name.trim(),
          description: description.trim() || undefined,
          groupId,
          bundleId,
          taskType,
          question: { prompt: prompt.trim(), ...(taskType === 'single_choice' ? { choices } : {}) },
          annotationSets,
          redundancy
        });
        id = job._id;
        setJobId(id);
      }
      const masks: MaskSelector | undefined = maskField
        ? {
            field: maskField,
            ...(maskValues.length ? { include: maskValues } : {}),
            ...(maskPerValue ? { perValue: Number(maskPerValue) } : {}),
            seed: Number(seed) || 42
          }
        : undefined;
      const body: MaterializeBody =
        selectionKind === 'manifest'
          ? {
              kind: 'manifest',
              ...(manifestContent.trim() ? { content: manifestContent, format: manifestFormat } : {}),
              ...(masks ? { masks } : {})
            }
          : {
              kind: 'filter',
              ...(sampleN ? { sampleN: Number(sampleN) } : {}),
              seed: Number(seed) || 42,
              ...(masks ? { masks } : {})
            };
      setMaterialized(await materializeJob(id, body));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      await transitionJob(jobId, 'activate');
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {step === 0 && (
        <Stack spacing={2}>
          <TextField label="Job name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
          />
          <TextField
            select
            label="Group"
            value={groupId}
            onChange={(event) => {
              setGroupId(event.target.value);
              setBundleId('');
            }}
            helperText="Group members label; owners/admins administer"
          >
            {adminGroups.map((group) => (
              <MenuItem key={group.groupId} value={group.groupId}>
                {group.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Bundle"
            value={bundleId}
            onChange={(event) => {
              setBundleId(event.target.value);
              setAnnotationSets([]);
            }}
            disabled={!groupId}
            helperText={groupId && groupBundles.length === 0 ? 'No ready bundles in this group — upload one first' : ' '}
          >
            {groupBundles.map((candidate) => (
              <MenuItem key={candidate._id} value={candidate._id}>
                {candidate.name} ({candidate.counts.frames} frames)
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}

      {step === 1 && (
        <Stack spacing={2}>
          <RadioGroup row value={taskType} onChange={(event) => {
            setTaskType(event.target.value as TaskType);
            setAnnotationSets([]);
          }}>
            <FormControlLabel value="mask_toggle" control={<Radio />} label="Mask verification (click incorrect masks)" />
            <FormControlLabel value="single_choice" control={<Radio />} label="Single choice (hotkeys)" />
          </RadioGroup>
          <TextField label="Prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />

          <Typography variant="subtitle2">
            Annotation set{taskType === 'mask_toggle' ? ' (exactly one)' : 's (at least one)'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {bundleSets.map((set) => (
              <Chip
                key={set}
                label={set}
                color={annotationSets.includes(set) ? 'primary' : 'default'}
                onClick={() => toggleSet(set)}
                data-testid={`set-chip-${set}`}
              />
            ))}
            {bundleSets.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                This bundle has no annotation sets — tasks will show the bare frame.
              </Typography>
            )}
          </Stack>
          {bundleSets.length > 0 && annotationSets.length === 0 && (
            <Alert severity="info">
              Pick a set — its layers are what the workbench draws over the frame. With none selected the labeler
              sees the bare frame and has nothing to judge.
            </Alert>
          )}

          {taskType === 'single_choice' && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">Choices</Typography>
              {choices.map((choice, index) => (
                <Stack key={index} direction="row" spacing={1}>
                  <TextField
                    size="small"
                    label="Key"
                    value={choice.key}
                    onChange={(event) =>
                      setChoices(choices.map((c, i) => (i === index ? { ...c, key: event.target.value } : c)))
                    }
                  />
                  <TextField
                    size="small"
                    label="Label"
                    value={choice.label}
                    onChange={(event) =>
                      setChoices(choices.map((c, i) => (i === index ? { ...c, label: event.target.value } : c)))
                    }
                  />
                  <TextField
                    size="small"
                    label="Hotkey"
                    value={choice.hotkey || ''}
                    slotProps={{ htmlInput: { maxLength: 1 } }}
                    onChange={(event) =>
                      setChoices(choices.map((c, i) => (i === index ? { ...c, hotkey: event.target.value || undefined } : c)))
                    }
                    sx={{ width: 90 }}
                  />
                  <Button size="small" disabled={choices.length <= 2} onClick={() => setChoices(choices.filter((_c, i) => i !== index))}>
                    Remove
                  </Button>
                </Stack>
              ))}
              <Button size="small" onClick={() => setChoices([...choices, { key: '', label: '' }])}>
                Add choice
              </Button>
            </Stack>
          )}

          <TextField
            label="Redundancy (independent labels per task)"
            type="number"
            value={redundancy}
            onChange={(event) => setRedundancy(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
            sx={{ width: 320 }}
          />
        </Stack>
      )}

      {step === 2 && (
        <Stack spacing={2}>
          <RadioGroup row value={selectionKind} onChange={(event) => setSelectionKind(event.target.value as 'manifest' | 'filter')}>
            <FormControlLabel
              value="manifest"
              control={<Radio />}
              label={`Manifest${bundle?.manifest ? ` (bundle has one: ${bundle.manifest.length} rows)` : ''}`}
            />
            <FormControlLabel value="filter" control={<Radio />} label="All frames / sample" />
          </RadioGroup>

          {selectionKind === 'manifest' && (
            <>
              <TextField
                label={bundle?.manifest ? 'Override manifest (optional — blank uses the bundle manifest)' : 'Manifest content'}
                value={manifestContent}
                onChange={(event) => setManifestContent(event.target.value)}
                multiline
                minRows={4}
                placeholder={'filename,stratum\nframe_000012.png,vehicle'}
              />
              <TextField select label="Format" value={manifestFormat} onChange={(event) => setManifestFormat(event.target.value as 'csv' | 'jsonl')} sx={{ width: 160 }}>
                <MenuItem value="csv">CSV</MenuItem>
                <MenuItem value="jsonl">JSONL</MenuItem>
              </TextField>
            </>
          )}

          {selectionKind === 'filter' && (
            <Stack direction="row" spacing={2}>
              <TextField
                label="Sample N (blank = all frames)"
                value={sampleN}
                onChange={(event) => setSampleN(event.target.value.replace(/\D/g, ''))}
                sx={{ width: 220 }}
              />
              <TextField label="Seed" value={seed} onChange={(event) => setSeed(event.target.value.replace(/\D/g, ''))} sx={{ width: 120 }} />
            </Stack>
          )}

          {maskSet && (maskFields || []).length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Mask subset (optional)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Label part of &quot;{maskSet}&quot; instead of every mask in it. The cap applies per value
                across the whole bundle, so a group scattered one-per-frame still reaches its target;
                frames left with no selected mask get no task.
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
                <TextField
                  select
                  label="Group by"
                  value={maskField}
                  onChange={(event) => {
                    setMaskField(event.target.value);
                    setMaskValues([]);
                  }}
                  sx={{ width: 220 }}
                >
                  <MenuItem value="">All masks (no subset)</MenuItem>
                  {(maskFields || []).map((entry) => (
                    <MenuItem key={entry.field} value={entry.field}>
                      {entry.field}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Max per value (blank = all)"
                  value={maskPerValue}
                  onChange={(event) => setMaskPerValue(event.target.value.replace(/\D/g, ''))}
                  disabled={!maskField}
                  sx={{ width: 220 }}
                />
              </Stack>
              {selectedField && (
                <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
                  {selectedField.values.map((value) => {
                    const on = maskValues.includes(value.value);
                    return (
                      <Chip
                        key={value.value}
                        label={`${value.value} (${value.count})`}
                        color={on ? 'primary' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        onClick={() =>
                          setMaskValues((previous) =>
                            on ? previous.filter((entry) => entry !== value.value) : [...previous, value.value]
                          )
                        }
                      />
                    );
                  })}
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    {maskValues.length ? `${maskValues.length} selected` : 'none selected = every value'}
                  </Typography>
                </Stack>
              )}
            </Paper>
          )}

          <Box>
            <Button variant="contained" disabled={busy} onClick={createAndMaterialize}>
              {jobId ? 'Re-materialize tasks' : 'Create draft & materialize'}
            </Button>
          </Box>

          {materialized && (
            <Alert severity={materialized.missing.length ? 'warning' : 'success'}>
              {materialized.tasks} tasks created
              {materialized.masks && (
                <>
                  {' '}
                  from{' '}
                  {Object.entries(materialized.masks)
                    .map(([value, count]) => `${count} ${value}`)
                    .join(', ')}{' '}
                  masks
                </>
              )}
              {materialized.missing.length > 0 && (
                <> — {materialized.missing.length} manifest rows matched no frame (e.g. {materialized.missing[0]})</>
              )}
            </Alert>
          )}
        </Stack>
      )}

      {step === 3 && (
        <Stack spacing={2}>
          <Typography variant="body1">
            <strong>{name}</strong> — {taskType === 'mask_toggle' ? 'mask verification' : 'single choice'} ·{' '}
            {materialized?.tasks} tasks · K={redundancy}
            {annotationSets.length > 0 && <> · sets: {annotationSets.join(', ')}</>}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Activating makes the job visible to every member of the group.
          </Typography>
          <Box>
            <Button variant="contained" disabled={busy} onClick={activate}>
              Activate job
            </Button>
          </Box>
        </Stack>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 4 }}>
        <Button disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button variant="outlined" disabled={!stepValid || busy} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
      </Stack>
    </Paper>
  );
};

export default NewJobPage;
