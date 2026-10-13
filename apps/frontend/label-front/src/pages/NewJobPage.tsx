import React, { useMemo, useState } from 'react';
import { useCompactLayout } from '@visin/frontend-core';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
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
import { Add, DeleteOutlined } from '@mui/icons-material';
import { listDatasets } from '../services/datasetService';
import { ClassInput, createJob, getMyGroups, listJobs, materializeJob, transitionJob } from '../services/jobService';
import { getGlobalConfig } from '../config/ConfigProvider';
import { JobSensor, LabelDataset, MaterializeBody, MaterializeResult } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { guessSensors } from './guessSensors';

const STEPS = ['Dataset', 'Sensors', 'Classes', 'Frames', 'Activate'];

const NONE = '';

interface ClassRow {
  /** stable for React, never sent */
  id: number;
  name: string;
  box: boolean;
  mask: boolean;
}

type DatasetGroup = LabelDataset['groups'][number];

let nextRowId = 1;
const newRow = (name = ''): ClassRow => ({ id: nextRowId++, name, box: true, mask: true });

const NewJobPage: React.FC = () => {
  usePageTitle('New job - Labeling');
  const navigate = useNavigate();
  const visionFrontUrl = (getGlobalConfig().VISION_FRONT_URL || '').replace(/\/$/, '');
  const { data: groups } = useQuery({ queryKey: ['my-groups'], queryFn: getMyGroups });
  const { data: datasets } = useQuery({ queryKey: ['datasets'], queryFn: listDatasets });
  // Classes can be copied from a job already set up on a dataset this person manages.
  const { data: jobs } = useQuery({ queryKey: ['jobs', 'admin'], queryFn: () => listJobs('admin') });

  const compact = useCompactLayout();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 0 — dataset
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [datasetId, setDatasetId] = useState('');

  // Step 1 — sensors
  const [camera, setCamera] = useState('');
  const [lidar, setLidar] = useState(NONE);
  const [radar, setRadar] = useState(NONE);

  // Step 2 — classes
  const [rows, setRows] = useState<ClassRow[]>(() => [newRow()]);

  // Step 3 — frames
  const [selectionKind, setSelectionKind] = useState<'filter' | 'manifest'>('filter');
  const [manifestContent, setManifestContent] = useState('');
  const [manifestFormat, setManifestFormat] = useState<'csv' | 'jsonl'>('csv');
  const [sampleN, setSampleN] = useState('');
  const [seed, setSeed] = useState('42');
  const [jobId, setJobId] = useState<string | null>(null);
  const [materialized, setMaterialized] = useState<MaterializeResult | null>(null);

  // The server lists only datasets I manage; a job needs images to show.
  const available = (datasets || []).filter((candidate) => candidate.imageCount > 0);
  const ownerOf = (candidate: LabelDataset) =>
    candidate.owner.kind === 'user'
      ? 'you'
      : (groups || []).find((group) => group.groupId === candidate.owner.id)?.name || 'a group';
  const dataset = useMemo(() => available.find((candidate) => candidate._id === datasetId), [available, datasetId]);
  const imageGroups = (dataset?.groups || []).filter((group) => group.images > 0);
  const pointGroups = (dataset?.groups || []).filter((group) => group.jsons > 0);

  const chooseDataset = (chosen: LabelDataset | undefined) => {
    setDatasetId(chosen?._id || '');
    const guess = guessSensors(chosen?.groups || []);
    setCamera(guess.camera);
    setLidar(guess.lidar);
    setRadar(guess.radar);
  };

  /** A radar group of JSON sidecars is a list of points; one of images is drawn like LiDAR. */
  const sensors = (): Pick<JobSensor, 'key' | 'group' | 'kind'>[] => {
    const radarGroup = (dataset?.groups || []).find((group) => group.name === radar);
    return [
      { key: 'camera', group: camera, kind: 'image' },
      ...(lidar ? [{ key: 'lidar' as const, group: lidar, kind: 'image' as const }] : []),
      ...(radar
        ? [{ key: 'radar' as const, group: radar, kind: radarGroup && radarGroup.images === 0 && radarGroup.jsons > 0 ? ('points' as const) : ('image' as const) }]
        : [])
    ];
  };

  const classInputs = (): ClassInput[] =>
    rows
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        tools: [...(row.box ? (['box'] as const) : []), ...(row.mask ? (['mask'] as const) : [])]
      }));

  const copyClassesFrom = (jobIdToCopy: string) => {
    const source = (jobs || []).find((candidate) => candidate._id === jobIdToCopy);
    if (!source) return;
    setRows(
      source.classes.map((entry) => ({
        id: nextRowId++,
        name: entry.name,
        box: entry.tools.includes('box'),
        mask: entry.tools.includes('mask')
      }))
    );
  };

  const namesAreUnique = new Set(rows.filter((row) => row.name.trim()).map((row) => row.name.trim().toLowerCase())).size ===
    rows.filter((row) => row.name.trim()).length;
  const classesValid = classInputs().length > 0 && namesAreUnique && rows.every((row) => !row.name.trim() || row.box || row.mask);

  const stepValid = [
    Boolean(name.trim() && datasetId),
    Boolean(camera) && new Set([camera, lidar, radar].filter(Boolean)).size === [camera, lidar, radar].filter(Boolean).length,
    classesValid,
    Boolean(materialized),
    true
  ][step];

  // Once a draft exists its dataset, sensors and classes are fixed; only the
  // frames can be prepared again.
  const minStep = jobId ? 3 : 0;

  const createAndMaterialize = async () => {
    setBusy(true);
    setError(null);
    try {
      let id = jobId;
      if (!id) {
        const job = await createJob({
          name: name.trim(),
          description: description.trim() || undefined,
          datasetId,
          sensors: sensors(),
          classes: classInputs()
        });
        id = job._id;
        setJobId(id);
      }
      const body: MaterializeBody =
        selectionKind === 'manifest'
          ? { kind: 'manifest', ...(manifestContent.trim() ? { content: manifestContent, format: manifestFormat } : {}) }
          : { kind: 'filter', ...(sampleN ? { sampleN: Number(sampleN) } : {}), seed: Number(seed) || 42 };
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

  const groupOption = (group: DatasetGroup) => (
    <MenuItem key={group.name} value={group.name}>
      {group.name} ({group.images > 0 ? `${group.images.toLocaleString()} images` : `${group.jsons.toLocaleString()} files`})
    </MenuItem>
  );

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      {/* On a phone five labels do not fit: the steps keep their numbers, and
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
            label="Dataset"
            value={datasetId}
            onChange={(event) => chooseDataset(available.find((candidate) => candidate._id === event.target.value))}
            helperText={
              datasets && available.length === 0 ? (
                <>
                  No dataset with images that you manage. Upload one in{' '}
                  <Link href={`${visionFrontUrl}/datasets`} target="_blank" rel="noreferrer">
                    Vision → Datasets
                  </Link>
                </>
              ) : dataset?.owner.kind === 'group' ? (
                `Belongs to ${ownerOf(dataset)}: its members label, its owners and admins run the job.`
              ) : dataset ? (
                'Yours: you run the job. Transfer the dataset to a group to have its members label.'
              ) : (
                'The job belongs with its dataset: whoever may change the dataset runs the job.'
              )
            }
          >
            {available.map((candidate) => (
              <MenuItem key={candidate._id} value={candidate._id}>
                {candidate.name} ({candidate.imageCount.toLocaleString()} images, {ownerOf(candidate)})
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}

      {step === 1 && (
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Labels are drawn on the camera frame. LiDAR and radar are shown over it, so they have to be projected into
            the camera&apos;s pixels — the same width and height, lined up.
          </Typography>
          <TextField
            select
            label="Camera"
            value={camera}
            onChange={(event) => setCamera(event.target.value)}
            helperText="The image group annotators label"
            required
          >
            {imageGroups.map(groupOption)}
          </TextField>
          <TextField
            select
            label="LiDAR projection (optional)"
            value={lidar}
            onChange={(event) => setLidar(event.target.value)}
            helperText="An image group with one file per frame, same name as the camera frame"
          >
            <MenuItem value={NONE}>None</MenuItem>
            {imageGroups.filter((group) => group.name !== camera).map(groupOption)}
          </TextField>
          <TextField
            select
            label="Radar projection (optional)"
            value={radar}
            onChange={(event) => setRadar(event.target.value)}
            helperText="An image group, or JSON files of projected points: [{u, v, range}]"
          >
            <MenuItem value={NONE}>None</MenuItem>
            {[...imageGroups, ...pointGroups.filter((group) => group.images === 0)]
              .filter((group) => group.name !== camera && group.name !== lidar)
              .map(groupOption)}
          </TextField>
        </Stack>
      )}

      {step === 2 && (
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            What annotators can label. Each class is drawn as a box, a mask, or both; colours and hotkeys (1–9) are
            assigned for you.
          </Typography>
          {(jobs || []).length > 0 && (
            <TextField
              select
              size="small"
              label="Copy classes from another job"
              value=""
              onChange={(event) => copyClassesFrom(event.target.value)}
              sx={{ maxWidth: 360 }}
            >
              {(jobs || [])
                .filter((candidate) => candidate.classes.length > 0)
                .map((candidate) => (
                  <MenuItem key={candidate._id} value={candidate._id}>
                    {candidate.name} ({candidate.classes.map((entry) => entry.name).join(', ')})
                  </MenuItem>
                ))}
            </TextField>
          )}
          {rows.map((row, index) => (
            <Stack key={row.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                size="small"
                label={`Class ${index + 1}`}
                value={row.name}
                autoFocus={index === rows.length - 1 && index > 0}
                onChange={(event) => setRows(rows.map((entry) => (entry.id === row.id ? { ...entry, name: event.target.value } : entry)))}
                sx={{ flexGrow: 1, maxWidth: 360 }}
              />
              <FormControlLabel
                label="Box"
                control={
                  <Checkbox
                    size="small"
                    checked={row.box}
                    onChange={(event) => setRows(rows.map((entry) => (entry.id === row.id ? { ...entry, box: event.target.checked } : entry)))}
                  />
                }
              />
              <FormControlLabel
                label="Mask"
                control={
                  <Checkbox
                    size="small"
                    checked={row.mask}
                    onChange={(event) => setRows(rows.map((entry) => (entry.id === row.id ? { ...entry, mask: event.target.checked } : entry)))}
                  />
                }
              />
              <IconButton
                size="small"
                aria-label={`remove class ${index + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((entry) => entry.id !== row.id))}
              >
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button size="small" startIcon={<Add />} onClick={() => setRows([...rows, newRow()])}>
              Add class
            </Button>
          </Box>
          {!namesAreUnique && <Alert severity="warning">Two classes have the same name.</Alert>}
          {rows.some((row) => row.name.trim() && !row.box && !row.mask) && (
            <Alert severity="warning">Every class needs a box, a mask, or both.</Alert>
          )}
        </Stack>
      )}

      {step === 3 && (
        <Stack spacing={2}>
          <RadioGroup row value={selectionKind} onChange={(event) => setSelectionKind(event.target.value as 'filter' | 'manifest')}>
            <FormControlLabel value="filter" control={<Radio />} label="All frames, or a random sample" />
            <FormControlLabel value="manifest" control={<Radio />} label="A list of frames" />
          </RadioGroup>

          {selectionKind === 'manifest' && (
            <>
              <TextField
                label="Frame list (optional — blank uses the dataset's own manifest)"
                value={manifestContent}
                onChange={(event) => setManifestContent(event.target.value)}
                multiline
                minRows={4}
                placeholder={'filename,stratum\nframe_000012.png,night'}
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

          <Box>
            <Button variant="contained" disabled={busy} onClick={createAndMaterialize}>
              {jobId ? 'Prepare frames again' : 'Create draft & prepare frames'}
            </Button>
          </Box>

          {materialized && (
            <Alert severity={materialized.missing.length ? 'warning' : 'success'}>
              {materialized.tasks.toLocaleString()} frames ready
              {Object.entries(materialized.sensors).map(([key, count]) => (
                <React.Fragment key={key}>
                  {' · '}
                  {key} on {count.toLocaleString()}
                </React.Fragment>
              ))}
              {materialized.missing.length > 0 && (
                <> — {materialized.missing.length} listed frames matched no image (e.g. {materialized.missing[0]})</>
              )}
              {jobId && (
                <>
                  {' · '}
                  <Link component={RouterLink} to={`/jobs/${jobId}/work?browse=1`} target="_blank" rel="noreferrer">
                    Preview a frame
                  </Link>
                </>
              )}
            </Alert>
          )}
        </Stack>
      )}

      {step === 4 && (
        <Stack spacing={2}>
          <Typography variant="body1">
            <strong>{name}</strong> — {materialized?.tasks.toLocaleString()} frames · {sensors().map((sensor) => sensor.key).join(' + ')} ·{' '}
            {classInputs().map((entry) => entry.name).join(', ')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Activating makes the job visible to everyone who may label this dataset. You can import existing labels
            from the job page afterwards.
          </Typography>
          <Box>
            <Button variant="contained" disabled={busy} onClick={activate}>
              Activate job
            </Button>
          </Box>
        </Stack>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 4 }}>
        <Button disabled={step <= minStep || busy} onClick={() => setStep(step - 1)}>
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
