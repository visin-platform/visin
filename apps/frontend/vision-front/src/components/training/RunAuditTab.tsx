import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { evaluationService, suiteService } from '../../services/evaluationService';
import type { Evaluation, JudgePairGroup } from '../../types/evaluation';
import type { Training } from '../../types/training';
import { checkpointLabel } from '../evaluations/sources';
import JudgeDisagreements, { type JudgeTransition } from '../evaluations/JudgeDisagreements';

const pct = (value: number | null | undefined) => (value == null ? '-' : `${(value * 100).toFixed(1)}%`);
const kappa = (value: number | null | undefined) => (value == null ? '-' : value.toFixed(2));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A metric of the run's own evaluation, pooled over every condition, for one class (or `overall`). */
const pooledMetric = (evaluation: Evaluation | undefined, classId: string, key: string): number | undefined => {
  const pooled = isRecord(evaluation?.results) ? evaluation.results.overall : undefined;
  const block = isRecord(pooled) ? pooled[classId] : undefined;
  const value = isRecord(block) ? block[key] : undefined;
  return typeof value === 'number' ? value : undefined;
};

/** The run's sample-scored evaluation: completed, on a suite, and not a person's. */
const modelEvaluationOf = (evaluations: Evaluation[]) =>
  evaluations.find((item) => item.samplesDigest && item.status === 'completed' && item.checkpoint?.kind !== 'human');

/**
 * A model's decisions against the annotator's audit of them: how often they agree, per field and per class, where they
 * part (model value against annotator value), and the decisions the annotator overturned, one by one with crops.
 * The comparison is the judge comparison of the run's evaluation with the suite's reference evaluation.
 */
const RunAuditTab: React.FC<{ training: Pick<Training, '_id' | 'suite'> }> = ({ training }) => {
  const [transition, setTransition] = React.useState<JudgeTransition>();
  const evaluations = useQuery({
    queryKey: ['run-sample-evaluations', training._id],
    queryFn: () => evaluationService.list({ trainingId: training._id, status: 'completed', limit: 20 })
  });
  const own = evaluations.data?.evaluations ?? [];
  const isReference = own.some((item) => item.checkpoint?.kind === 'human');
  const model = modelEvaluationOf(own);
  const reference = useQuery({
    queryKey: ['evaluation-reference', model?._id],
    queryFn: () => evaluationService.reference(model!._id),
    enabled: Boolean(model),
    retry: false
  });
  const pair = useQuery({
    queryKey: ['judge-pair', model?._id, reference.data?._id],
    queryFn: () => evaluationService.compareJudges(model!._id, reference.data!._id),
    enabled: Boolean(model && reference.data)
  });
  const pinned = training.suite;
  const suite = useQuery({
    queryKey: ['suite', pinned?.slug, String(pinned?.version)],
    queryFn: () => suiteService.get(pinned!.slug, String(pinned!.version)),
    enabled: Boolean(pinned)
  });

  if (evaluations.isLoading || reference.isLoading || pair.isLoading || suite.isLoading) {
    return <CircularProgress aria-label="Loading the audit" />;
  }
  if (isReference) {
    return <Alert severity="info">This run is the annotator's audit: it is the reference the models are measured against.</Alert>;
  }
  if (!model) {
    return <Alert severity="info">This run has no completed sample evaluation to audit yet.</Alert>;
  }
  if (reference.isError || !reference.data) {
    return <Alert severity="info">This run's suite has no human reference you can read, so there is no audit to show.</Alert>;
  }
  if (pair.isError || !pair.data || !suite.data) {
    return <Alert severity="error">{pair.error instanceof Error ? pair.error.message : 'The comparison with the annotator could not be loaded.'}</Alert>;
  }

  const annotator = checkpointLabel(reference.data.checkpoint);
  const fields = pair.data.fields;
  const outcome = fields.find((field) => field.field === 'outcome') ?? fields[0];
  const overall = (groups: JudgePairGroup[]) => groups.find((group) => group.groupBy === 'overall');
  const classes = outcome.groups.filter((group) => group.groupBy === 'class');
  const sizes = outcome.groups.filter((group) => group.groupBy === 'size');
  const hasRates = classes.some((group) => pooledMetric(model, group.value!, 'false_accept') !== undefined);
  const summary = overall(outcome.groups);
  const values = [...new Set((summary?.matrix ?? []).flatMap((cell) => [cell.a, cell.b]))].sort();
  const count = (a: string, b: string) => summary?.matrix.find((cell) => cell.a === a && cell.b === b)?.count ?? 0;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6">Against the annotator</Typography>
          <Typography variant="body2" color="text.secondary">
            {(summary?.count ?? 0).toLocaleString()} of this run&apos;s decisions were audited by {annotator}.
          </Typography>
        </Box>
        <Button
          size="small"
          component={RouterLink}
          to={`/suites/${encodeURIComponent(pair.data.suite.slug)}/${pair.data.suite.version}/judges?a=${encodeURIComponent(model._id)}`}
        >
          Compare with another judge
        </Button>
      </Box>

      <section aria-labelledby="audit-agreement">
        <Typography id="audit-agreement" variant="subtitle1" gutterBottom>
          Agreement by decision
        </Typography>
        <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label="Agreement by decision table">
          <Table size="small" aria-label="Agreement by decision">
            <TableHead>
              <TableRow>
                <TableCell>Decision</TableCell>
                <TableCell align="right">Audited</TableCell>
                <TableCell align="right">Agreement</TableCell>
                <TableCell align="right">κ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((field) => {
                const group = overall(field.groups);
                return (
                  <TableRow key={field.field}>
                    <TableCell>{field.field}</TableCell>
                    <TableCell align="right">{(group?.count ?? 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{pct(group?.agreement)}</TableCell>
                    <TableCell align="right">{kappa(group?.binaryKappa ?? group?.kappa)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </section>

      {values.length > 0 && (
        <section aria-labelledby="audit-transitions">
          <Typography id="audit-transitions" variant="subtitle1" gutterBottom>
            {outcome.field}: model against annotator
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Rows are what the model decided, columns what the annotator decided. Choose a disagreeing cell to see those decisions.
          </Typography>
          <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label="Model against annotator table">
            <Table size="small" aria-label="Model against annotator">
              <TableHead>
                <TableRow>
                  <TableCell>Model \ annotator</TableCell>
                  {values.map((value) => (
                    <TableCell key={value} align="right">
                      {value}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {values.map((a) => (
                  <TableRow key={a}>
                    <TableCell component="th" scope="row">
                      {a}
                    </TableCell>
                    {values.map((b) => (
                      <TableCell key={b} align="right">
                        {a === b || count(a, b) === 0 ? (
                          count(a, b).toLocaleString()
                        ) : (
                          <Button
                            size="small"
                            aria-label={`${count(a, b).toLocaleString()} decisions: model ${a}, annotator ${b}`}
                            onClick={() => {
                              setTransition({ field: outcome.field, a, b });
                              document.getElementById('disagreements-heading')?.scrollIntoView?.({ block: 'start' });
                            }}
                          >
                            {count(a, b).toLocaleString()}
                          </Button>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </section>
      )}

      <section aria-labelledby="audit-classes">
        <Typography id="audit-classes" variant="subtitle1" gutterBottom>
          By class
        </Typography>
        <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label="Audit by class table">
          <Table size="small" aria-label="Audit by class">
            <TableHead>
              <TableRow>
                <TableCell>Class</TableCell>
                <TableCell align="right">Audited</TableCell>
                <TableCell align="right">{outcome.field} agreement</TableCell>
                {hasRates && <TableCell align="right">False accept</TableCell>}
                {hasRates && <TableCell align="right">False reject</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {classes.map((group) => (
                <TableRow key={group.value}>
                  <TableCell>{group.value}</TableCell>
                  <TableCell align="right">{group.count.toLocaleString()}</TableCell>
                  <TableCell align="right">{pct(group.agreement)}</TableCell>
                  {hasRates && <TableCell align="right">{pct(pooledMetric(model, group.value!, 'false_accept'))}</TableCell>}
                  {hasRates && <TableCell align="right">{pct(pooledMetric(model, group.value!, 'false_reject'))}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {hasRates && (
          <Typography variant="caption" color="text.secondary">
            False accept and false reject are the run&apos;s scores on the suite, against the same annotator, for the masks it classifies.
          </Typography>
        )}
      </section>

      {sizes.length > 0 && (
        <section aria-labelledby="audit-sizes">
          <Typography id="audit-sizes" variant="subtitle1" gutterBottom>
            By size
          </Typography>
          <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label="Audit by size table">
            <Table size="small" aria-label="Audit by size">
              <TableHead>
                <TableRow>
                  <TableCell>Size</TableCell>
                  <TableCell align="right">Audited</TableCell>
                  <TableCell align="right">{outcome.field} agreement</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sizes.map((group) => (
                  <TableRow key={group.value}>
                    <TableCell>{group.value}</TableCell>
                    <TableCell align="right">{group.count.toLocaleString()}</TableCell>
                    <TableCell align="right">{pct(group.agreement)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </section>
      )}

      <JudgeDisagreements
        key={`${model._id}:${reference.data._id}`}
        first={model._id}
        second={reference.data._id}
        suite={suite.data}
        pair={pair.data}
        transition={transition}
        labels={{ first: 'Model', second: 'Annotator' }}
        secondIsReference
      />
    </Box>
  );
};

export default RunAuditTab;
