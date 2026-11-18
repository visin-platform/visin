import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { useCompactLayout } from '@visin/frontend-core';
import { MobileListRow } from '../common/MobileList';
import { suiteService } from '../../services/evaluationService';
import { listRunSamples, type RunSample } from '../../services/runSampleService';
import type { Training } from '../../types/training';
import CropSourcePicker, { type CropSource } from '../evaluations/CropSourcePicker';
import JudgeCrop from '../evaluations/JudgeCrop';

const PAGE_SIZES = [25, 50, 100];

/** "1,234 ms", or '-' for a sample that recorded no time. */
const latency = (value: number | undefined) => (value === undefined ? '-' : `${Math.round(value).toLocaleString()} ms`);

/**
 * Every decision an inference run recorded, a page at a time: what was judged (the suite's categorical attributes),
 * what the model decided (its fields), and the reply it gave. Filters are the suite's own vocabularies and are applied
 * in the database, so a run of 145,000 samples pages as fast as one of ten.
 */
const RunSamplesTab: React.FC<{ training: Pick<Training, '_id' | 'suite'> }> = ({ training }) => {
  const [attrs, setAttrs] = React.useState<Record<string, string>>({});
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(0);
  const [limit, setLimit] = React.useState(PAGE_SIZES[0]);
  const [source, setSource] = React.useState<CropSource>({ datasetId: '', group: '' });
  const compact = useCompactLayout();

  const pinned = training.suite;
  const suite = useQuery({
    queryKey: ['suite', pinned?.slug, String(pinned?.version)],
    queryFn: () => suiteService.get(pinned!.slug, String(pinned!.version)),
    enabled: Boolean(pinned)
  });
  const protocol = suite.data?.protocol.samples;
  // Only attributes with a vocabulary can be chosen from; a frame name or a pixel count is shown, not filtered.
  const filterAttrs = (protocol?.attrs ?? []).filter((attr) => attr.values?.length);
  const fieldKeys = (protocol?.fields ?? []).map((field) => field.key);

  const rows = useQuery({
    queryKey: ['run-samples', training._id, attrs, fields, page, limit],
    queryFn: () => listRunSamples(training._id, { page: page + 1, limit, attrs, fields })
  });

  const choose = (setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, key: string) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setter((current) => {
        const next = { ...current };
        if (value) next[key] = value;
        else delete next[key];
        return next;
      });
      setPage(0);
    };
  const select = (label: string, value: string, options: string[], onChange: ReturnType<typeof choose>) => (
    <TextField key={label} select size="small" label={label} value={value} onChange={onChange} sx={{ minWidth: 140 }}>
      <MenuItem value="">
        <em>Any</em>
      </MenuItem>
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </TextField>
  );

  if (!pinned) {
    return <Alert severity="info">This run is not pinned to a sample suite, so it has no samples to list.</Alert>;
  }

  const total = rows.data?.pagination.total ?? 0;
  const crops = Boolean(source.datasetId && source.group);
  const reply = (sample: RunSample) => (
    <>
      {sample.raw ?? (
        <Typography variant="body2" component="span" color="text.secondary">
          Not recorded
        </Typography>
      )}
      {sample.parseFailed && <Chip size="small" variant="outlined" label="parse failed" sx={{ ml: 0.5 }} />}
      {sample.abstained && <Chip size="small" variant="outlined" label="abstained" sx={{ ml: 0.5 }} />}
    </>
  );

  return (
    <Box component="section" aria-labelledby="run-samples-heading" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Typography id="run-samples-heading" variant="h6" sx={{ flexGrow: 1 }}>
          Samples
        </Typography>
        <Button size="small" component={RouterLink} to={`/suites/${encodeURIComponent(pinned.slug)}/${pinned.version}/judges`}>
          Compare judges
        </Button>
      </Box>
      {suite.isError && <Alert severity="warning">The suite could not be read, so its filters are not offered.</Alert>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {filterAttrs.map((attr) => select(attr.key, attrs[attr.key] ?? '', attr.values!, choose(setAttrs, attr.key)))}
        {(protocol?.fields ?? []).map((field) => select(field.key, fields[field.key] ?? '', field.values, choose(setFields, field.key)))}
      </Box>
      <Box>
        <CropSourcePicker value={source} onChange={setSource} />
      </Box>
      {rows.isLoading ? (
        <CircularProgress aria-label="Loading samples" />
      ) : rows.isError ? (
        <Alert severity="error">{rows.error instanceof Error ? rows.error.message : 'Could not load the samples.'}</Alert>
      ) : !rows.data?.samples.length ? (
        <Alert severity="info">No samples match these filters.</Alert>
      ) : (
        <Paper variant="outlined">
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
            {total.toLocaleString()} {total === 1 ? 'sample matches' : 'samples match'}
          </Typography>
          {compact ? (
            // On a phone, one sample per row: what was judged on a line, the decisions side by side, the reply below.
            <Box role="list" aria-label="Samples">
              {rows.data.samples.map((sample) => (
                <Box role="listitem" key={sample.id}>
                  <MobileListRow
                    title={sample.id}
                    meta={filterAttrs.map((attr) => `${attr.key} ${sample.attrs[attr.key] === undefined ? '-' : String(sample.attrs[attr.key])}`).join(' · ')}
                    figures={[
                      ...fieldKeys.map((key) => ({ label: key, value: sample.fields[key] ?? '-' })),
                      { label: 'latency', value: latency(sample.latencyMs) }
                    ]}
                    footer={
                      <>
                        <Box sx={{ overflowWrap: 'anywhere' }}>{reply(sample)}</Box>
                        {crops && (
                          <Box sx={{ mt: 1 }}>
                            <JudgeCrop sample={sample} datasetId={source.datasetId} group={source.group} maxHeight={160} />
                          </Box>
                        )}
                      </>
                    }
                  />
                </Box>
              ))}
            </Box>
          ) : (
            <TableContainer tabIndex={0} role="region" aria-label="Samples table">
              <Table size="small" aria-label="Samples">
                <TableHead>
                  <TableRow>
                    {crops && <TableCell>Crop</TableCell>}
                    <TableCell>Sample</TableCell>
                    {filterAttrs.map((attr) => (
                      <TableCell key={attr.key}>{attr.key}</TableCell>
                    ))}
                    {fieldKeys.map((key) => (
                      <TableCell key={key}>{key}</TableCell>
                    ))}
                    <TableCell>Reply</TableCell>
                    <TableCell align="right">Latency</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.data.samples.map((sample) => (
                    <TableRow key={sample.id}>
                      {crops && (
                        <TableCell sx={{ width: 120 }}>
                          <JudgeCrop sample={sample} datasetId={source.datasetId} group={source.group} maxHeight={96} />
                        </TableCell>
                      )}
                      <TableCell sx={{ overflowWrap: 'anywhere' }}>{sample.id}</TableCell>
                      {filterAttrs.map((attr) => (
                        <TableCell key={attr.key}>{sample.attrs[attr.key] === undefined ? '-' : String(sample.attrs[attr.key])}</TableCell>
                      ))}
                      {fieldKeys.map((key) => (
                        <TableCell key={key}>{sample.fields[key] ?? '-'}</TableCell>
                      ))}
                      <TableCell sx={{ maxWidth: 280, overflowWrap: 'anywhere' }}>{reply(sample)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {latency(sample.latencyMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={limit}
            rowsPerPageOptions={PAGE_SIZES}
            onPageChange={(_event, next) => setPage(next)}
            onRowsPerPageChange={(event) => {
              setLimit(Number(event.target.value));
              setPage(0);
            }}
          />
        </Paper>
      )}
    </Box>
  );
};

export default RunSamplesTab;
