import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { ContentCopy as CopyIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { PageHeader } from '@visin/frontend-core';
import MetricName from '../components/common/MetricName';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResultBreakdown from '../components/training/ResultBreakdown';
import OutputLegend from '../components/visualizations/OutputLegend';
import { visionApiOrigin } from '../config/visionApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { FORMAT_LABELS, preprocessingText } from '../providers/visin';
import { modelOutputsService } from '../services/modelOutputsService';
import { projectService } from '../services/projectService';
import { TaxonomyProvider } from '../taxonomy/TaxonomyProvider';
import { useTaxonomy } from '../taxonomy/useTaxonomy';
import type { EvaluationResults } from '../types';
import type { ModelOutputs } from '../types/modelOutputs';
import { formatDateTime } from '../utils';
import { formatBytes } from '../utils/datasetMapping';
import { OUTPUT_KINDS, OUTPUT_KIND_DESCRIPTIONS, OUTPUT_KIND_LABELS } from '../utils/outputPixels';
import { blockName, formatResult, numericRows } from '../utils/numericRows';

type Fact = [string, React.ReactNode] | false | undefined;

/** Label and value, one row each; the same fact list the evaluation page uses. */
const Facts: React.FC<{ rows: Fact[] }> = ({ rows }) => (
  <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' }, gap: 1, m: 0 }}>
    {rows.filter((row): row is [string, React.ReactNode] => Boolean(row)).map(([label, value], index) => (
      <React.Fragment key={`${index}-${label}`}>
        <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
      </React.Fragment>
    ))}
  </Box>
);

const Section: React.FC<{ title: string; intro?: string; children: React.ReactNode }> = ({ title, intro, children }) => (
  <Paper variant="outlined" component="section" aria-label={title} sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
    <Typography variant="h6" component="h2" sx={{ mb: intro ? 0.5 : 2 }}>{title}</Typography>
    {intro && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{intro}</Typography>}
    {children}
  </Paper>
);

/** Put `text` on the clipboard, saying for a moment whether that worked. */
const useCopy = () => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  const copy = (text: string) => {
    if (!navigator.clipboard) return setState('failed');
    navigator.clipboard.writeText(text).then(() => setState('copied'), () => setState('failed'));
  };
  return { state, copy };
};

/** A SHA-256, shortened to what a person compares by eye, with the whole of it a click away. */
const Digest: React.FC<{ value?: string; label: string }> = ({ value, label }) => {
  const { state, copy } = useCopy();
  if (!value) return <>Not recorded</>;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box component="code" title={value} sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
        {value.slice(0, 12)}…{value.slice(-4)}
      </Box>
      <Tooltip title={state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : `Copy the full ${label}`}>
        <IconButton size="small" aria-label={`Copy the ${label}`} onClick={() => copy(value)}>
          <CopyIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const datasetLabel = (dataset: { id?: string; name?: string; revision?: string; archiveRevision?: string } | null | undefined) => {
  if (!dataset) return 'Not stated when the outputs were uploaded';
  const name = dataset.name ?? dataset.id ?? 'Unnamed dataset';
  const revision = dataset.archiveRevision ?? dataset.revision;
  const label = revision ? `${name} · ${revision}` : name;
  return dataset.id ? <Link component={RouterLink} to={`/datasets/${dataset.id}`}>{label}</Link> : label;
};

const absolute = (path: string) => `${visionApiOrigin()}${path}`;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The epoch's own numbers, by block (training, validation) and named the way the project names them. */
const EpochResults: React.FC<{ results: unknown }> = ({ results }) => {
  const taxonomy = useTaxonomy();
  const rows = numericRows(results);
  if (rows.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>The epoch reported no numbers.</Typography>;
  }
  const blocks = new Map<string, Array<[string, number]>>();
  for (const [path, value] of rows) {
    const [block, ...rest] = path.split('.');
    const key = rest.length ? block : '';
    blocks.set(key, [...(blocks.get(key) ?? []), [rest.length ? rest.join('.') : path, value]]);
  }
  return (
    <TableContainer sx={{ mb: 3, maxHeight: 420 }}>
      <Table size="small" stickyHeader aria-label="Epoch results">
        <TableHead>
          <TableRow>
            <TableCell>Result</TableCell>
            <TableCell align="right">Value</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...blocks.entries()].map(([block, entries]) => (
            <React.Fragment key={block || 'top'}>
              {block && (
                <TableRow>
                  <TableCell colSpan={2} sx={{ fontWeight: 600, bgcolor: 'action.hover' }}>{blockName(block)}</TableCell>
                </TableRow>
              )}
              {entries.map(([path, value]) => {
                const metric = taxonomy.metric(path.split('.').pop()!);
                const prefix = path.includes('.') ? `${path.split('.').slice(0, -1).join(' · ')} · ` : '';
                return (
                  <TableRow key={path}>
                    <TableCell>
                      {prefix}
                      <MetricName label={metric.label} description={metric.description} />
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontFamily: 'monospace' }}>
                        {block ? `${block}.${path}` : path}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatResult(value, metric)}</TableCell>
                  </TableRow>
                );
              })}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

/** The answer as JSON, to read whole, copy or keep. */
const JsonView: React.FC<{ data: ModelOutputs }> = ({ data }) => {
  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const { state, copy } = useCopy();
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(data.model.filename ?? 'model').replace(/\.[^.]+$/, '')}-outputs.json`;
    anchor.click();
    // Revoked once the browser has started the download, which some cancel if the link goes at once.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box>
          <Typography variant="subtitle2">All of this as JSON</Typography>
          <Typography variant="caption" color="text.secondary">For scripts and tools; the same answer the API gives.</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <Button size="small" variant="outlined" onClick={() => copy(text)}>
            {state === 'copied' ? 'Copied' : 'Copy'}
          </Button>
          <Button size="small" variant="outlined" onClick={download}>Download .json</Button>
          {state === 'failed' && (
            <Typography variant="caption" color="error" role="status">The browser would not allow copying</Typography>
          )}
        </Box>
        <Box
          component="pre"
          sx={{ m: 0, p: 2, maxHeight: 480, overflow: 'auto', fontSize: '0.75rem', bgcolor: 'background.default', borderRadius: 1 }}
        >
          {text}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

/**
 * What a stored model produced, laid out: the checkpoint and its licence, what the network is and expects, the data it
 * was trained and run on, what each kind of output shows, and the scores of the epoch it came from. The frames
 * themselves are on the Visualizations page; the JSON is here too, whole.
 */
const ModelOutputsPage: React.FC = () => {
  const { id = '', modelId = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['model-outputs', id, modelId],
    queryFn: () => modelOutputsService.get(id, modelId),
    enabled: Boolean(id && modelId)
  });
  const projectId = data?.run.project?.id;
  // The project names and colours the classes and metrics; the page reads fine without it.
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectService.getProjectById(projectId!),
    enabled: Boolean(projectId)
  });
  usePageTitle(data ? `${data.model.filename ?? 'Model'} outputs - Vision` : 'Model outputs - Vision');

  const classes = useMemo(
    () =>
      (data?.model.modelInfo?.train_classes ?? [])
        .filter((entry) => Number.isInteger(entry?.index) && typeof entry?.name === 'string')
        .sort((a, b) => a.index - b.index),
    [data]
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress aria-label="Loading model outputs" />
      </Box>
    );
  }
  if (error || !data) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error instanceof Error ? error.message : 'Could not load this model’s outputs'}</Alert>
      </Container>
    );
  }

  const { run, model, metrics } = data;
  const title = model.filename ?? `${FORMAT_LABELS[model.format] ?? model.format} checkpoint`;
  const framesHref = `/visualizations?training=${encodeURIComponent(run.uuid)}&view=outputs&epoch=${run.epoch}`;
  const totalOutputs = Object.values(data.totals).reduce((sum, count) => sum + count, 0);
  const frameCount = data.predictedOn.reduce((sum, { frames }) => sum + frames.length, 0);
  const info = model.modelInfo;
  const licence = model.license?.name ?? model.license?.id;

  return (
    <TaxonomyProvider taxonomy={project?.data?.taxonomy}>
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <PageBreadcrumbs
          items={[
            { label: 'Models', href: '/models' },
            { label: run.name, href: `/trainings/${run.id}` },
            { label: title, current: true }
          ]}
        />
        <PageHeader
          title={title}
          subtitle={
            <>
              The checkpoint from epoch {run.epoch} of{' '}
              <Link component={RouterLink} to={`/trainings/${run.id}`}>{run.name}</Link>
              {run.project ? ` in ${run.project.name}` : ''}
              {frameCount > 0 ? `, and what it predicted on ${plural(frameCount, 'frame')}.` : '.'}
            </>
          }
          actions={
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button component={RouterLink} to={framesHref} variant="contained" disabled={totalOutputs === 0}>
                View frames
              </Button>
              <Button href={absolute(model.file)} download variant="outlined">
                Download weights ({formatBytes(model.size)})
              </Button>
            </Box>
          }
        />

        <Section title="Checkpoint" intro="The file these outputs came from, and the terms it is shared under.">
          <Facts
            rows={[
              ['Format', FORMAT_LABELS[model.format] ?? model.format],
              ['Size', formatBytes(model.size)],
              ['Epoch', run.epoch],
              ['Licence', licence ? (model.license?.url ? <Link href={model.license.url} target="_blank" rel="noopener noreferrer">{licence}</Link> : licence) : 'Not stated'],
              model.credit !== undefined && ['Credit', model.credit],
              data.sameCheckpoint.length > 0 && [
                'Also available as',
                <Box component="span" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {data.sameCheckpoint.map((other) => (
                    <Link key={other.id} href={absolute(other.file)} download>
                      {FORMAT_LABELS[other.format] ?? other.format}
                      {other.size === undefined ? '' : ` · ${formatBytes(other.size)}`}
                    </Link>
                  ))}
                </Box>
              ],
              model.parity !== undefined && [
                'ONNX matches the weights',
                `${(model.parity.argmaxMismatchFraction * 100).toFixed(2)}% of pixels get a different class; the largest difference in output is ${model.parity.maxAbsDiff.toPrecision(2)} (checked on ${plural(model.parity.frames, 'frame')})`
              ],
              ['File SHA-256', <Digest value={model.sha256} label="file SHA-256" />],
              model.sourceSha256 !== undefined && ['Exported from weights', <Digest value={model.sourceSha256} label="weights SHA-256" />]
            ]}
          />
        </Section>

        <Section title="Model" intro="What the network is and what it expects as input, as the weights record it.">
          <Facts
            rows={[
              info?.backbone !== undefined && ['Backbone', String(info.backbone)],
              info?.mode !== undefined && ['Input mode', String(info.mode)],
              info?.dataset !== undefined && ['Training set (from the weights)', String(info.dataset)],
              ['Preprocessing', preprocessingText(info) ?? 'Not recorded'],
              ['Classes', classes.length ? <OutputLegend kind="mask" classes={classes} color="text.primary" /> : 'Not recorded']
            ]}
          />
        </Section>

        <Section title="Data">
          <Facts
            rows={[
              ['Trained on', datasetLabel(data.trainedOn)],
              ...data.predictedOn.map(
                ({ dataset, frames }, index): [string, React.ReactNode] => [
                  index === 0 ? 'Predicted on' : '',
                  <>{datasetLabel(dataset)} · {plural(frames.length, 'frame')}</>
                ]
              ),
              data.predictedOn.length === 0 && ['Predicted on', 'No outputs uploaded yet']
            ]}
          />
        </Section>

        <Section title="Outputs" intro="What the model produced for each frame. See them on the Visualizations page.">
          <TableContainer>
            <Table size="small" aria-label="Outputs by kind">
              <TableHead>
                <TableRow>
                  <TableCell>Kind</TableCell>
                  <TableCell align="right">Frames</TableCell>
                  <TableCell>What it shows</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {OUTPUT_KINDS.map((kind) => (
                  <TableRow key={kind}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{OUTPUT_KIND_LABELS[kind]}</TableCell>
                    <TableCell align="right">{data.totals[kind] ?? 0}</TableCell>
                    <TableCell>{OUTPUT_KIND_DESCRIPTIONS[kind]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {data.truncated && (
            <Alert severity="info" sx={{ mt: 2 }}>
              The JSON lists the first {data.files.length} outputs; the counts include every one.
            </Alert>
          )}
          <Accordion variant="outlined" disableGutters sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">Reading the files in your own code</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Facts
                rows={OUTPUT_KINDS.map((kind): [string, React.ReactNode] => [
                  `${OUTPUT_KIND_LABELS[kind]} (${kind})`,
                  data.folders[kind]
                ]).concat(
                  [
                    data.confidence && [
                      'Confidence values',
                      `${data.confidence.quantity}, in ${data.confidence.range}. Stored as ${Object.entries(data.confidence.encodings).map(([name, rule]) => `${name}: ${rule}`).join('; ')}.`
                    ],
                    data.outputGeometry && [
                      'Geometry',
                      `In ${data.outputGeometry.coordinateSpace} coordinates. ${data.outputGeometry.mapping}`
                    ]
                  ].filter((row): row is [string, string] => Boolean(row))
                )}
              />
            </AccordionDetails>
          </Accordion>
        </Section>

        <Section title="Scores" intro={`What epoch ${metrics.epoch} reported while training, and every test of this checkpoint you can see.`}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>Reported while training</Typography>
          <EpochResults results={metrics.results} />
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>Tests of this checkpoint</Typography>
          {metrics.evaluations.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No test you can see scored this checkpoint.</Typography>
          ) : (
            metrics.evaluations.map((evaluation) => {
              const samples = Object.values(evaluation.sampleCounts ?? {}).reduce((sum, count) => sum + count, 0);
              return (
                <Accordion key={evaluation.id} variant="outlined" disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2">
                      {evaluation.suite ? `${evaluation.suite.slug}@${evaluation.suite.version}` : 'Test without a suite'}
                      {evaluation.executedAt ? ` · ${formatDateTime(evaluation.executedAt)}` : ''}
                      {samples ? ` · ${plural(samples, 'sample')}` : ''}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Link component={RouterLink} to={`/evaluations/${evaluation.id}`} variant="body2">Open the evaluation</Link>
                    {evaluation.results && (
                      <Box sx={{ mt: 2 }}>
                        <ResultBreakdown results={evaluation.results as EvaluationResults} classMetrics="discover" />
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })
          )}
        </Section>

        <JsonView data={data} />
      </Container>
    </TaxonomyProvider>
  );
};

export default ModelOutputsPage;
