import React, { useMemo, useState } from 'react';
import { useCompactLayout } from '@visin/frontend-core';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Link,
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
import { getMaskFields, listDatasets } from '../services/datasetService';
import { createJob, getMyGroups, materializeJob, transitionJob } from '../services/jobService';
import { getGlobalConfig } from '../config/ConfigProvider';
import { JobChoice, LabelDataset, MaskSelector, MaterializeBody, MaterializeResult, TaskType } from '../types';

const STEPS = ['Basics', 'Question', 'Tasks', 'Activate'];

const DEFAULT_CHOICES: JobChoice[] = [
  { key: 'good', label: 'Good', hotkey: 'g' },
  { key: 'bad', label: 'Bad', hotkey: 'b' }
];

const NewJobPage: React.FC = () => {
  const navigate = useNavigate();
  const visionFrontUrl = (getGlobalConfig().VISION_FRONT_URL || '').replace(/\/$/, '');
  const { data: groups } = useQuery({ queryKey: ['my-groups'], queryFn: getMyGroups });
  const { data: datasets } = useQuery({ queryKey: ['datasets'], queryFn: listDatasets });

  const compact = useCompactLayout();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1 — basics
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [framesGroup, setFramesGroup] = useState('');

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
  // A public dataset can back any group's job; a group dataset only its own.
  const available = (datasets || []).filter(
    (candidate) => candidate.imageCount > 0 && (candidate.visibility === 'public' || candidate.groupId === groupId)
  );
  const dataset = useMemo(() => available.find((candidate) => candidate._id === datasetId), [available, datasetId]);
  const imageGroups = (dataset?.groups || []).filter((group) => group.images > 0).map((group) => group.name);
  // Every group except the frames one can carry annotation layers.
  const annotationGroups = imageGroups.filter((group) => group !== framesGroup);

  /** Default the frames to a group called `frames`, else the first one. */
  const chooseDataset = (chosen: LabelDataset | undefined) => {
    const groupNames = (chosen?.groups || []).filter((group) => group.images > 0).map((group) => group.name);
    setDatasetId(chosen?._id || '');
    setFramesGroup(groupNames.includes('frames') ? 'frames' : groupNames[0] || '');
    setAnnotationSets([]);
  };

  // Mask metadata is per annotation set, so the groupable fields only exist once
  // a set is picked — one full-corpus dataset can then be sliced per job.
  const maskSet = taskType === 'mask_toggle' ? annotationSets[0] : undefined;
  const { data: maskFields } = useQuery({
    queryKey: ['mask-fields', datasetId, maskSet],
    queryFn: () => getMaskFields(datasetId, maskSet!),
    enabled: Boolean(datasetId && maskSet)
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

  // A dataset with annotation groups but none picked materializes tasks with no
  // payload — the workbench then shows the bare frame and there is nothing to
  // judge, so block it.
  const stepValid = [
    Boolean(name.trim() && groupId && datasetId && framesGroup),
    Boolean(prompt.trim()) &&
      (taskType === 'mask_toggle'
        ? annotationSets.length === 1
        : choices.length >= 2 && (annotationGroups.length === 0 || annotationSets.length >= 1)) &&
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
          datasetId,
          framesGroup,
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
      {/* On a phone four labels do not fit: the steps keep their numbers, and
          only the current one is named. */}
      <Stepper
        activeStep={step}
        sx={{ mb: 4, ...(compact && { '& .MuiStepLabel-label:not(.Mui-active)': { display: 'none' } }) }}
      >
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
              chooseDataset(undefined);
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
            label="Dataset"
            value={datasetId}
            onChange={(event) => chooseDataset(available.find((candidate) => candidate._id === event.target.value))}
            disabled={!groupId}
            helperText={
              groupId && available.length === 0 ? (
                <>
                  No dataset with images is available here — upload one in{' '}
                  <Link href={`${visionFrontUrl}/datasets`} target="_blank" rel="noreferrer">
                    Vision → Datasets
                  </Link>
                </>
              ) : (
                ' '
              )
            }
          >
            {available.map((candidate) => (
              <MenuItem key={candidate._id} value={candidate._id}>
                {candidate.name} ({candidate.imageCount.toLocaleString()} images)
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Frames"
            value={framesGroup}
            onChange={(event) => {
              setFramesGroup(event.target.value);
              setAnnotationSets([]);
            }}
            disabled={!datasetId}
            helperText="The dataset's image group the labeler sees; the others can be drawn over it"
          >
            {imageGroups.map((group) => (
              <MenuItem key={group} value={group}>
                {group}
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
            {annotationGroups.map((set) => (
              <Chip
                key={set}
                label={set}
                color={annotationSets.includes(set) ? 'primary' : 'default'}
                onClick={() => toggleSet(set)}
                data-testid={`set-chip-${set}`}
              />
            ))}
            {annotationGroups.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                This dataset has no other image group — tasks will show the bare frame.
              </Typography>
            )}
          </Stack>
          {annotationGroups.length > 0 && annotationSets.length === 0 && (
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
              label="Manifest"
            />
            <FormControlLabel value="filter" control={<Radio />} label="All frames / sample" />
          </RadioGroup>

          {selectionKind === 'manifest' && (
            <>
              <TextField
                label="Manifest content (optional — blank uses the dataset's own manifest)"
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
                across the whole dataset, so a group scattered one-per-frame still reaches its target;
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
