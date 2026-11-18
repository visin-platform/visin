import React from 'react';
import { Alert, Box, CircularProgress, MenuItem, Pagination, Paper, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { evaluationService } from '../../services/evaluationService';
import { listDatasets } from '../../services/datasetService';
import type { JudgeDisagreementQuery, JudgePair, Suite } from '../../types/evaluation';
import LicenseChip from '../licensing/LicenseChip';
import JudgeCrop from './JudgeCrop';

export interface JudgeTransition { field: string; a: string; b: string }

const otherFields = (values: Record<string, string> | undefined, selected: string) =>
  Object.entries(values ?? {}).filter(([key]) => key !== selected).map(([key, value]) => `${key}: ${value}`).join(' · ');

const JudgeDisagreements: React.FC<{ first: string; second: string; suite: Suite; pair: JudgePair; transition?: JudgeTransition }> = ({ first, second, suite, pair, transition }) => {
  const fields = suite.protocol.samples?.fields ?? [];
  const [field, setField] = React.useState(fields.find(item => item.key === 'outcome')?.key ?? fields[0]?.key ?? '');
  const [className, setClassName] = React.useState('');
  const [size, setSize] = React.useState('');
  const [role, setRole] = React.useState('');
  const [firstValue, setFirstValue] = React.useState('');
  const [secondValue, setSecondValue] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [datasetId, setDatasetId] = React.useState('');
  const [group, setGroup] = React.useState('');

  React.useEffect(() => {
    if (!transition) return;
    setField(transition.field); setFirstValue(transition.a); setSecondValue(transition.b); setReference(''); setPage(1);
  }, [transition]);

  const query: JudgeDisagreementQuery = { field, class: className || undefined, size: size || undefined, role: role || undefined, a: firstValue || undefined, b: secondValue || undefined, reference: reference || undefined, page, limit: 10 };
  const rows = useQuery({ queryKey: ['judge-disagreements', first, second, query], queryFn: () => evaluationService.judgeDisagreements(first, second, query), enabled: Boolean(field) });
  const datasets = useQuery({ queryKey: ['judge-image-datasets'], queryFn: () => listDatasets({ page: 1, limit: 100 }) });
  const dataset = datasets.data?.datasets.find(item => item._id === datasetId);
  const fieldValues = fields.find(item => item.key === field)?.values ?? [];
  const roles = [...new Set(pair.fields.flatMap(item => item.groups.filter(groupRow => groupRow.groupBy === 'role' && groupRow.value).map(groupRow => groupRow.value!)))];
  const change = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => { setter(event.target.value); setPage(1); };
  const select = (label: string, value: string, options: string[], setter: (value: string) => void, disabled = false) => <TextField select size="small" label={label} value={value} onChange={change(setter)} disabled={disabled} sx={{ minWidth: 150 }}>
    <MenuItem value=""><em>Any</em></MenuItem>{options.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
  </TextField>;

  return <section aria-labelledby="disagreements-heading">
    <Typography id="disagreements-heading" variant="h6" gutterBottom>Browse disagreements</Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      <TextField select size="small" label="Decision field" value={field} onChange={event => { setField(event.target.value); setFirstValue(''); setSecondValue(''); setReference(''); setPage(1); }} sx={{ minWidth: 150 }}>
        {fields.map(item => <MenuItem key={item.key} value={item.key}>{item.key}</MenuItem>)}
      </TextField>
      {select('First value', firstValue, fieldValues, setFirstValue)}
      {select('Second value', secondValue, fieldValues, setSecondValue)}
      {select('Class', className, suite.protocol.classes.map(item => item.id), setClassName)}
      {select('Size', size, suite.protocol.conditions.map(item => item.name), setSize)}
      {select('Role', role, roles, setRole)}
      {select('Annotator value', reference, fieldValues, setReference, !pair.referenceEvaluationId)}
    </Box>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
      <TextField select size="small" label="Image dataset" value={datasetId} onChange={event => { setDatasetId(event.target.value); setGroup(''); }} sx={{ minWidth: 220 }}>
        <MenuItem value=""><em>No dataset selected</em></MenuItem>
        {(datasets.data?.datasets ?? []).map(item => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="Image group" value={group} onChange={event => setGroup(event.target.value)} disabled={!dataset} sx={{ minWidth: 180 }}>
        <MenuItem value=""><em>Choose a group</em></MenuItem>
        {(dataset?.groups ?? []).filter(item => item.images > 0).map(item => <MenuItem key={item.name} value={item.name}>{item.name} ({item.images.toLocaleString()})</MenuItem>)}
      </TextField>
    </Box>
    {datasets.isError && <Alert severity="warning" sx={{ mb: 1 }}>Image datasets could not be loaded. Decisions are still available.</Alert>}
    {(datasets.data?.pagination.pages ?? 0) > 1 && <Typography variant="caption" color="text.secondary">The dataset picker shows the first 100 accessible datasets.</Typography>}
    {dataset && <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }} aria-label="Terms of the selected image dataset">
      <Typography variant="body2" color="text.secondary">Image dataset licence</Typography>
      <LicenseChip license={dataset.license} />
      {dataset.credit && <Typography variant="body2" color="text.secondary">· Credit: {dataset.credit}</Typography>}
    </Box>}
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Crops use recorded bounding boxes in original-image pixels. Frames are matched by name in the selected dataset; that match is not verified against the suite. An unavailable frame or box is shown as missing.</Typography>
    {rows.isLoading ? <CircularProgress /> : rows.isError ? <Alert severity="error">{rows.error instanceof Error ? rows.error.message : 'Could not load disagreements.'}</Alert> : !rows.data?.samples.length ? <Alert severity="info">No disagreements match these filters.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">{rows.data.pagination.total.toLocaleString()} matching samples</Typography>
      {rows.data.samples.map(sample => <Paper key={sample.id} variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>{sample.id}</Typography>
        <Typography variant="caption" color="text.secondary">{Object.entries(sample.attrs).filter(([key]) => key !== 'bbox').map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(180px, 1fr) 2fr' }, gap: 2, mt: 1 }}>
          <JudgeCrop sample={sample} datasetId={datasetId} group={group} />
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <Typography variant="body2"><strong>First:</strong> {sample.a.fields[field] ?? 'Not recorded'}</Typography>
            {otherFields(sample.a.fields, field) && <Typography variant="body2" color="text.secondary">{otherFields(sample.a.fields, field)}</Typography>}
            <Typography variant="body2" color="text.secondary">{sample.a.raw ?? 'Raw reply not recorded'}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}><strong>Second:</strong> {sample.b.fields[field] ?? 'Not recorded'}</Typography>
            {otherFields(sample.b.fields, field) && <Typography variant="body2" color="text.secondary">{otherFields(sample.b.fields, field)}</Typography>}
            <Typography variant="body2" color="text.secondary">{sample.b.raw ?? 'Raw reply not recorded'}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}><strong>Annotator:</strong> {sample.reference?.fields?.[field] ?? 'Not recorded'}</Typography>
            {otherFields(sample.reference?.fields, field) && <Typography variant="body2" color="text.secondary">{otherFields(sample.reference?.fields, field)}</Typography>}
          </Box>
        </Box>
      </Paper>)}
      {rows.data.pagination.pages > 1 && <Pagination count={rows.data.pagination.pages} page={page} onChange={(_event, value) => setPage(value)} aria-label="Disagreement pages" />}
    </Box>}
  </section>;
};

export default JudgeDisagreements;
