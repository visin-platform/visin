import React from 'react';
import { Alert, Box, Button, CircularProgress, Container, MenuItem, Pagination, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts';
import { PageHeader, useChartColors } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { checkpointLabel } from '../components/evaluations/sources';
import { usePageTitle } from '../hooks/usePageTitle';
import { evaluationService, suiteService } from '../services/evaluationService';
import JudgeDisagreements, { type JudgeTransition } from '../components/evaluations/JudgeDisagreements';
import type { Evaluation, JudgePair, JudgePairGroup, Suite } from '../types/evaluation';

const pct = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const number = (value: number | null | undefined) => value == null ? '—' : value.toFixed(2);
const overall = (groups: JudgePairGroup[]) => groups.find(group => group.groupBy === 'overall');

const PairResults: React.FC<{ pair: JudgePair; suite: Suite; onTransition: (transition: JudgeTransition) => void }> = ({ pair, suite, onTransition }) => {
  const colors = useChartColors();
  const sizes = suite.protocol.conditions.map(condition => condition.name).filter(size => pair.fields.some(field => field.groups.some(group => group.groupBy === 'size' && group.value === size)));
  const series = pair.fields.filter(field => field.groups.some(group => group.groupBy === 'size')).map((field, index) => ({
    label: field.field,
    data: sizes.map(size => {
      const group = field.groups.find(item => item.groupBy === 'size' && item.value === size);
      return group ? group.divergence * 100 : null;
    }),
    color: colors.slot(index),
    valueFormatter: (value: number | null) => value === null ? 'Not recorded' : `${value.toFixed(1)}%`
  }));
  const reference = pair.fields.flatMap(field => field.groups.filter(group => group.groupBy === 'overall' && group.reference).map(group => ({ field: field.field, stats: group.reference! })));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
      <section aria-labelledby="agreement-heading">
        <Typography id="agreement-heading" variant="h6" gutterBottom>Agreement and transitions</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Each field uses the samples with a decision from both runs. Binary κ uses the suite’s acceptance values when declared.</Typography>
        {pair.fields.map(field => {
          const group = overall(field.groups);
          if (!group) return <Alert key={field.field} severity="info">No matching decisions for {field.field}.</Alert>;
          return (
            <Box key={field.field} sx={{ mb: 2 }}>
              <Typography variant="subtitle1">{field.field}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {group.count.toLocaleString()} paired · agreement {pct(group.agreement)} · divergence {pct(group.divergence)} · κ {number(group.kappa)}
                {group.binaryKappa !== undefined && ` · binary κ ${number(group.binaryKappa)}`}
                {suite.protocol.samples?.weight && ` · weighted divergence ${pct(group.weightedDivergence)}`}
              </Typography>
              <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label={`${field.field} transition table`}>
                <Table size="small" aria-label={`${field.field} transitions`}>
                  <TableHead><TableRow><TableCell>First</TableCell><TableCell>Second</TableCell><TableCell align="right">Samples</TableCell>{suite.protocol.samples?.weight && <TableCell align="right">Weight</TableCell>}</TableRow></TableHead>
                  <TableBody>{group.matrix.map(cell => <TableRow key={JSON.stringify([cell.a, cell.b])}><TableCell>{cell.a}</TableCell><TableCell>{cell.b}</TableCell><TableCell align="right">{cell.a === cell.b ? cell.count.toLocaleString() : <Button size="small" aria-label={`${cell.count.toLocaleString()} · browse ${field.field}: ${cell.a} to ${cell.b}`} onClick={() => onTransition({ field: field.field, a: cell.a, b: cell.b })}>{cell.count.toLocaleString()}</Button>}</TableCell>{suite.protocol.samples?.weight && <TableCell align="right">{cell.weight.toLocaleString()}</TableCell>}</TableRow>)}</TableBody>
                </Table>
              </TableContainer>
            </Box>
          );
        })}
      </section>
      <section aria-labelledby="class-heading">
        <Typography id="class-heading" variant="h6" gutterBottom>κ by class</Typography>
        <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label="Kappa by class table"><Table size="small" aria-label="Kappa by class">
          <TableHead><TableRow><TableCell>Field</TableCell><TableCell>Class</TableCell><TableCell align="right">Samples</TableCell><TableCell align="right">κ</TableCell><TableCell align="right">Binary κ</TableCell></TableRow></TableHead>
          <TableBody>{pair.fields.flatMap(field => field.groups.filter(group => group.groupBy === 'class').map(group => <TableRow key={JSON.stringify([field.field, group.value])}><TableCell>{field.field}</TableCell><TableCell>{group.value}</TableCell><TableCell align="right">{group.count.toLocaleString()}</TableCell><TableCell align="right">{number(group.kappa)}</TableCell><TableCell align="right">{number(group.binaryKappa)}</TableCell></TableRow>))}</TableBody>
        </Table></TableContainer>
      </section>
      {sizes.length > 0 && series.length > 0 && <section aria-labelledby="size-heading">
        <Typography id="size-heading" variant="h6" gutterBottom>Divergence by size</Typography>
        <Paper variant="outlined" sx={{ p: 2 }}><Box sx={{ width: '100%', height: 300 }}><BarChart xAxis={[{ data: sizes, scaleType: 'band', label: 'Size' }]} yAxis={[{ label: 'Divergence (%)', min: 0, max: 100 }]} series={series} /></Box></Paper>
      </section>}
      {reference.map(({ field, stats }, index) => <section key={field} aria-labelledby={`reference-${index}`}>
        <Typography id={`reference-${index}`} variant="h6" gutterBottom>Against the annotator · {field}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{stats.total.toLocaleString()} audited samples have outcomes from both runs and the reference.</Typography>
        <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label={`${field} annotator comparison table`}><Table size="small" aria-label={`${field} annotator comparison`}><TableBody>
          <TableRow><TableCell>First error</TableCell><TableCell align="right">{pct(stats.errorRateA)} ({stats.errorA.toLocaleString()})</TableCell></TableRow>
          <TableRow><TableCell>Second error</TableCell><TableCell align="right">{pct(stats.errorRateB)} ({stats.errorB.toLocaleString()})</TableCell></TableRow>
          <TableRow><TableCell>Changed outcomes</TableCell><TableCell align="right">{stats.flips.toLocaleString()} · first right {stats.correctA.toLocaleString()} · second right {stats.correctB.toLocaleString()}</TableCell></TableRow>
          <TableRow><TableCell>Keep unless both delete</TableCell><TableCell align="right">{pct(stats.keepUnlessBothDeleteErrorRate)}</TableCell></TableRow>
          <TableRow><TableCell>Changed outcomes reviewed</TableCell><TableCell align="right">{pct(stats.reviewedErrorRate)}</TableCell></TableRow>
        </TableBody></Table></TableContainer>
      </section>)}
    </Box>
  );
};

const JudgeComparePage: React.FC = () => {
  const { slug = '', version = '' } = useParams<{ slug: string; version: string }>();
  const [params, setParams] = useSearchParams();
  const first = params.get('a') ?? '';
  const second = params.get('b') ?? '';
  const [page, setPage] = React.useState(1);
  const [transition, setTransition] = React.useState<JudgeTransition>();
  React.useEffect(() => setTransition(undefined), [first, second]);
  usePageTitle(`Compare judges on ${slug}@${version}`);
  const suite = useQuery({ queryKey: ['suite', slug, version], queryFn: () => suiteService.get(slug, version) });
  const list = useQuery({ queryKey: ['judge-evaluations', slug, suite.data?.version, page], queryFn: () => evaluationService.list({ suite: `${slug}@${suite.data!.version}`, page, limit: 100 }), enabled: Boolean(suite.data?.protocol.samples) });
  const a = useQuery({ queryKey: ['evaluation', first], queryFn: () => evaluationService.get(first), enabled: Boolean(first) });
  const b = useQuery({ queryKey: ['evaluation', second], queryFn: () => evaluationService.get(second), enabled: Boolean(second) });
  const repeatsA = useQuery({
    queryKey: ['judge-repeats', slug, suite.data?.version, a.data?.checkpointKey],
    queryFn: () => evaluationService.list({ suite: `${slug}@${suite.data!.version}`, checkpointKey: a.data!.checkpointKey, limit: 1000 }),
    enabled: Boolean(suite.data?.protocol.samples && a.data?.checkpointKey)
  });
  const repeatsB = useQuery({
    queryKey: ['judge-repeats', slug, suite.data?.version, b.data?.checkpointKey],
    queryFn: () => evaluationService.list({ suite: `${slug}@${suite.data!.version}`, checkpointKey: b.data!.checkpointKey, limit: 1000 }),
    enabled: Boolean(suite.data?.protocol.samples && b.data?.checkpointKey)
  });
  const validPair = Boolean(first && second && first !== second && suite.data && a.data && b.data && a.data.suite?.id === suite.data._id && b.data.suite?.id === suite.data._id);
  const pair = useQuery({ queryKey: ['judge-pair', first, second], queryFn: () => evaluationService.compareJudges(first, second), enabled: validPair });
  const candidates = (list.data?.evaluations ?? []).filter(evaluation => evaluation.samplesDigest && evaluation.checkpoint?.kind !== 'human' && evaluation.status === 'completed');
  const options = [...new Map([...candidates, ...[a.data, b.data].filter((item): item is Evaluation => Boolean(item))].map(item => [item._id, item])).values()];
  const findRepeat = (items: Evaluation[] | undefined, key: string | undefined) => items?.find(candidate => candidate.samplesDigest && candidate.status === 'completed' && candidate.checkpointKey === key && candidate._id !== first && candidate._id !== second);
  const repeatA = findRepeat(repeatsA.data?.evaluations, a.data?.checkpointKey);
  const repeatB = findRepeat(repeatsB.data?.evaluations, b.data?.checkpointKey);
  const repeat = repeatA ?? repeatB;
  const repeatBase = repeatA ? a.data : b.data;
  const noise = useQuery({ queryKey: ['judge-pair', repeatBase?._id, repeat?._id], queryFn: () => evaluationService.compareJudges(repeatBase!._id, repeat!._id), enabled: Boolean(validPair && repeat && repeatBase) });
  const choose = (key: 'a' | 'b', value: string) => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; });
  const failure = suite.error ?? list.error ?? a.error ?? b.error ?? pair.error;

  return <Container maxWidth="lg" sx={{ pb: 4 }}>
    <PageBreadcrumbs items={[{ label: 'Suites', href: '/suites' }, { label: `${slug}@${version}`, href: `/suites/${slug}/${version}` }, { label: 'Compare judges', current: true }]} />
    <PageHeader title="Compare judges" subtitle={`${slug}@${version}`} />
    {failure && <Alert severity="error" sx={{ mb: 2 }}>{failure instanceof Error ? failure.message : 'Could not load comparison'}</Alert>}
    {suite.isLoading || list.isLoading ? <CircularProgress /> : !suite.data?.protocol.samples ? <Alert severity="info">This suite does not contain sample-scored evaluations.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {(['a', 'b'] as const).map((key, index) => <TextField key={key} select size="small" label={index === 0 ? 'First evaluation' : 'Second evaluation'} value={key === 'a' ? first : second} onChange={event => choose(key, event.target.value)} sx={{ minWidth: 260 }}>
          <MenuItem value=""><em>Choose an evaluation</em></MenuItem>
          {options.map(item => <MenuItem key={item._id} value={item._id}>{checkpointLabel(item.checkpoint)} · {item.uuid}</MenuItem>)}
        </TextField>)}
        <Button disabled={!first || !second} onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.set('a', second); next.set('b', first); return next; })}>Swap</Button>
      </Box>
      {(list.data?.pagination.pages ?? 0) > 1 && <Pagination count={list.data!.pagination.pages} page={page} onChange={(_event, value) => setPage(value)} aria-label="Evaluation pages" />}
      {first && second && first === second && <Alert severity="info">Choose two different evaluations. Repeated runs of the same checkpoint can measure the noise floor.</Alert>}
      {first && second && first !== second && a.data && b.data && !validPair && <Alert severity="error">Both evaluations must belong to this suite.</Alert>}
      {!first || !second ? <Alert severity="info">Choose two completed sample evaluations. Repeat runs of one checkpoint can be compared to measure the noise floor.</Alert> : pair.isLoading && validPair ? <CircularProgress /> : pair.data && suite.data ? <>
        {a.data?.checkpointKey && a.data.checkpointKey === b.data?.checkpointKey && <Alert severity="info">These evaluations use the same checkpoint; this comparison measures variation between runs.</Alert>}
        {(noise.isError || repeatsA.isError || repeatsB.isError) && <Alert severity="warning">Could not load the repeat comparison.</Alert>}
        {noise.data && <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="subtitle1">Available repeat of {checkpointLabel(repeatBase?.checkpoint)}</Typography><Typography variant="body2">{noise.data.fields.map(field => { const group = overall(field.groups); return `${field.field}: ${pct(group?.divergence)} (${group?.count.toLocaleString() ?? '0'} paired)`; }).join(' · ')}</Typography></Paper>}
        <PairResults pair={pair.data} suite={suite.data} onTransition={value => { setTransition(value); document.getElementById('disagreements-heading')?.scrollIntoView?.({ block: 'start' }); }} />
        <JudgeDisagreements key={`${first}:${second}`} first={first} second={second} suite={suite.data} pair={pair.data} transition={transition} />
      </> : null}
    </Box>}
  </Container>;
};

export default JudgeComparePage;
