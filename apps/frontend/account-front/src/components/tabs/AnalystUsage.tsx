import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { Panel } from '@visin/frontend-core';
import {
  useAnalystUsage,
  useBackfillAnalystPrices,
  useRefreshAnalystPrices,
  useSaveAnalystPrices
} from '../../hooks/useAnalyst';
import type {
  AnalystPrice,
  AnalystPriceRefresh,
  AnalystProviderId,
  AnalystUsage,
  AnalystUsageTally
} from '../../types/analyst';

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' }
];

const number = (value: number): string => value.toLocaleString('en-US');

/** Tokens in the millions read better as 1.7M; the exact count is in the table. */
const compact = (value: number): string =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/**
 * Money in the deployment's currency, never a hard-coded symbol. Below one unit it keeps four decimals, since one
 * question can cost a fraction of a cent. A code the browser does not know is shown as written.
 */
function money(value: number | null, currency: string): string {
  // No total across currencies: adding euros to dollars would be a number that means nothing.
  if (value === null || currency === 'MIXED') return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: value < 1 ? 4 : 2
    }).format(value);
  } catch {
    return `${value.toFixed(value < 1 ? 4 : 2)} ${currency}`;
  }
}

const day = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

const totalTokens = (tally: AnalystUsageTally): number => tally.inputTokens + tally.outputTokens;

const priceKey = (provider: string, model: string): string => `${provider}:${model}`;

/** What is typed for one model's price: text, since it may be half-typed. */
interface PriceDraft {
  input: string;
  output: string;
}

const parsePrice = (text: string): number => (/^\d+(\.\d+)?$/.test(text.trim()) ? Number(text.trim()) : NaN);

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
      {note && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}

/** Where a model's price came from, so nobody wonders whether it is theirs or fetched. */
function PriceSource({ price, edited }: { price: AnalystPrice | null; edited: boolean }) {
  const text = edited
    ? 'Edited'
    : !price
      ? ''
      : price.source === 'fetched'
        ? `Fetched ${price.fetchedAt ? new Date(price.fetchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}`.trim()
        : 'Entered by hand';
  return text ? (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
      {text}
    </Typography>
  ) : null;
}

/** What a refresh did, in words: the models it priced, and why it left any out. */
function RefreshSummary({ result }: { result: AnalystPriceRefresh }) {
  const names = (models: string[]) => models.join(', ');
  return (
    <Alert severity={result.notFound.length > 0 ? 'warning' : 'success'}>
      {result.updated.length > 0
        ? `Prices updated for ${result.updated.length} model${result.updated.length === 1 ? '' : 's'}: ${names(result.updated)}.`
        : 'No prices changed.'}
      {result.notFound.length > 0 &&
        ` The price list has no price for ${names(result.notFound)}; enter ${result.notFound.length === 1 ? 'it' : 'them'} by hand.`}
      {result.keptManual.length > 0 && ` Kept the price you entered for ${names(result.keptManual)}.`}
    </Alert>
  );
}

function costCell(tally: AnalystUsageTally, currency: string, pricesInPeriod = 1) {
  return (
    <>
      <strong>{money(tally.cost, currency)}</strong>
      {tally.cost !== null && tally.unpricedTokens > 0 && (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          + {compact(tally.unpricedTokens)} tokens unpriced
        </Typography>
      )}
      {pricesInPeriod > 1 && (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          price changed in this period
        </Typography>
      )}
    </>
  );
}

/**
 * What the analyst has used and what that costs, for platform administrators (the Usage view of the Analyst section).
 *
 * Money is an estimate: the service counts the tokens each answered question reported and multiplies by the prices
 * entered here, since providers return no price. Models with no price show tokens and no money rather than a guess.
 * Questions that failed or were interrupted may have used tokens nobody reported, so they are counted, not costed.
 */
const AnalystUsagePanel: React.FC = () => {
  const [days, setDays] = useState(30);
  const [draft, setDraft] = useState<Record<string, PriceDraft>>({});
  const [currencyDraft, setCurrencyDraft] = useState<string>();
  const usage = useAnalystUsage(days, true);
  const savePrices = useSaveAnalystPrices();
  const refreshPrices = useRefreshAnalystPrices();
  const backfill = useBackfillAnalystPrices();

  if (usage.isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label="Loading usage" />
      </Box>
    );
  }
  if (usage.isError || !usage.data) {
    return (
      <Alert severity="error" action={<Button onClick={() => void usage.refetch()}>Retry</Button>}>
        {usage.error instanceof Error ? usage.error.message : 'The usage could not be read.'}
      </Alert>
    );
  }

  const report: AnalystUsage = usage.data;
  // The currency of the price table, for questions asked from now on: not the report's, which is MIXED where
  // questions in the period were asked in more than one.
  const currency = currencyDraft ?? report.prices.currency;
  const priced = report.prices.entries.length > 0;
  const heaviestDay = Math.max(
    1,
    ...report.byDay.map((row) => (report.totals.cost === null ? totalTokens(row) : (row.cost ?? 0)))
  );
  const byCost = report.totals.cost !== null;
  // Models that have a price now, with questions asked before it was set: the ones a backfill would price.
  const pricedLater = report.byModel.reduce((sum, row) => sum + (row.price ? row.unpricedQuestions : 0), 0);

  /** What a model's price boxes show: what was typed, else what is saved. */
  const shown = (provider: string, model: string, saved: AnalystPrice | null): PriceDraft =>
    draft[priceKey(provider, model)] ?? {
      input: saved ? String(saved.inputPerMillion) : '',
      output: saved ? String(saved.outputPerMillion) : ''
    };
  const edit = (provider: string, model: string, saved: AnalystPrice | null, change: Partial<PriceDraft>) =>
    setDraft((previous) => ({
      ...previous,
      [priceKey(provider, model)]: { ...shown(provider, model, saved), ...change }
    }));

  // Each model row is either empty (no price), complete (both numbers) or half-done, which cannot be saved.
  const rows = report.byModel.map((row) => {
    const text = shown(row.provider, row.model, row.price);
    const empty = !text.input.trim() && !text.output.trim();
    const input = parsePrice(text.input);
    const output = parsePrice(text.output);
    const edited = Boolean(draft[priceKey(row.provider, row.model)]);
    return { row, text, empty, input, output, edited, valid: empty || (!Number.isNaN(input) && !Number.isNaN(output)) };
  });
  const invalid = rows.some((entry) => !entry.valid);
  const currencyValid = /^[A-Za-z]{3}$/.test(currency.trim());
  // Changed means different from what is saved, not merely touched: typing the old value back is no change.
  const rowChanged = ({ row, empty, input, output }: (typeof rows)[number]) =>
    empty
      ? Boolean(row.price)
      : !row.price || input !== row.price.inputPerMillion || output !== row.price.outputPerMillion;
  const changed = currency.trim().toUpperCase() !== report.prices.currency || rows.some(rowChanged);

  const save = () => {
    // Prices of models not shown here (not used in this window) are kept as they are; shown models take what is
    // typed, and a model left empty loses its price.
    const shownKeys = new Set(report.byModel.map((row) => priceKey(row.provider, row.model)));
    const kept = report.prices.entries.filter((entry) => !shownKeys.has(priceKey(entry.provider, entry.model)));
    const edited = rows.flatMap(({ row, empty, input, output }) => {
      if (empty) return [];
      // A price left as it was keeps its source; one changed by hand is the administrator's, which a refresh
      // will not overwrite.
      const unchanged = row.price?.inputPerMillion === input && row.price?.outputPerMillion === output;
      return [
        {
          provider: row.provider as AnalystProviderId,
          model: row.model,
          inputPerMillion: input,
          outputPerMillion: output,
          source: unchanged ? row.price!.source : ('manual' as const),
          fetchedAt: unchanged ? row.price!.fetchedAt : null
        }
      ];
    });
    savePrices.mutate(
      { currency: currency.trim().toUpperCase(), entries: [...kept, ...edited] },
      {
        onSuccess: () => {
          setDraft({});
          setCurrencyDraft(undefined);
        }
      }
    );
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={days}
          onChange={(_event, next: number | null) => next && setDays(next)}
          aria-label="Period"
        >
          {WINDOWS.map((window) => (
            <ToggleButton key={window.days} value={window.days} sx={{ px: 2, textTransform: 'none' }}>
              {window.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          Answered questions since {day(report.since)}, by UTC day.
        </Typography>
        {usage.isFetching && <CircularProgress size={18} aria-label="Updating" />}
      </Stack>

      <Panel component="section" aria-label="Totals">
        <Box
          sx={{
            p: { xs: 2, sm: 3 },
            display: 'grid',
            gap: 3,
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }
          }}
        >
          <Tile
            label="Estimated spend"
            value={money(report.totals.cost, report.currency)}
            note={
              report.currency === 'MIXED'
                ? 'Prices in this period are in more than one currency, so there is no total. Choose a shorter period.'
                : report.totals.cost === null
                  ? report.totals.questions > 0
                    ? 'Enter prices below to see money'
                    : undefined
                  : [
                      report.totals.unpricedQuestions > 0 &&
                        `plus ${compact(report.totals.unpricedTokens)} tokens on ${report.totals.unpricedQuestions} question${report.totals.unpricedQuestions === 1 ? '' : 's'} without a price`,
                      report.backfilledQuestions > 0 &&
                        `${report.backfilledQuestions} priced afterwards, at the price then current`
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
            }
          />
          <Tile label="Questions answered" value={number(report.totals.questions)} />
          <Tile
            label="Tokens"
            value={compact(totalTokens(report.totals))}
            note={`${compact(report.totals.inputTokens)} in · ${compact(report.totals.outputTokens)} out`}
          />
          <Tile
            label="Not counted"
            value={number(report.failedQuestions)}
            note="Failed or stopped questions may have used tokens that were not reported"
          />
        </Box>
      </Panel>

      {report.totals.questions === 0 ? (
        <Alert severity="info">No questions have been answered in this period yet.</Alert>
      ) : (
        <>
          <Panel component="section" aria-label="By model and price">
            <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" component="h2">
                By model, and what each costs
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Providers do not send a price with an answer. Press Refresh prices to fill them in from a public price
                list, or enter what yours charges, per million tokens. A price you type is never overwritten by a
                refresh. A price applies to questions asked after you set it: an answered question keeps the price it
                was asked at. Costs are estimates from token counts, not an invoice.
              </Typography>
              <TableContainer>
                <Table size="small" aria-label="Usage by model">
                  <TableHead>
                    <TableRow>
                      <TableCell>Model</TableCell>
                      <TableCell align="right">Questions</TableCell>
                      <TableCell align="right">Tokens in / out</TableCell>
                      <TableCell align="right">Price in, per 1M</TableCell>
                      <TableCell align="right">Price out, per 1M</TableCell>
                      <TableCell align="right">Cost</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map(({ row, text, input, output, edited }) => (
                      <TableRow key={priceKey(row.provider, row.model)}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {row.model}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {row.provider}
                          </Typography>
                          {/* With the model, not under one price box: a caption there lifts that box above the other. */}
                          <PriceSource price={row.price} edited={edited} />
                        </TableCell>
                        <TableCell align="right">{number(row.questions)}</TableCell>
                        <TableCell align="right">
                          {number(row.inputTokens)} / {number(row.outputTokens)}
                        </TableCell>
                        {(['input', 'output'] as const).map((side) => {
                          const value = side === 'input' ? input : output;
                          const typed = text[side].trim();
                          return (
                            <TableCell key={side} align="right" sx={{ width: 140, verticalAlign: 'middle' }}>
                              <TextField
                                size="small"
                                value={text[side]}
                                onChange={(event) =>
                                  edit(row.provider, row.model, row.price, { [side]: event.target.value })
                                }
                                error={Boolean(typed) && Number.isNaN(value)}
                                placeholder="—"
                                slotProps={{
                                  htmlInput: {
                                    'aria-label': `${row.model} ${side === 'input' ? 'input' : 'output'} price per million tokens`,
                                    inputMode: 'decimal',
                                    style: { textAlign: 'right' }
                                  }
                                }}
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell align="right">{costCell(row, report.currency, row.pricesInPeriod)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {pricedLater > 0 && (
                <Alert
                  severity="info"
                  action={
                    <Button color="inherit" onClick={() => backfill.mutate()} disabled={backfill.isPending || changed}>
                      {backfill.isPending ? 'Pricing…' : 'Price earlier questions'}
                    </Button>
                  }
                >
                  {pricedLater} earlier question{pricedLater === 1 ? ' was' : 's were'} asked before{' '}
                  {pricedLater === 1 ? 'its' : 'their'} model had a price. Price {pricedLater === 1 ? 'it' : 'them'} at
                  today&apos;s price? That is an estimate, since the price then may have been different, and they are
                  marked as priced afterwards.
                </Alert>
              )}
              {backfill.isError && (
                <Alert severity="error">
                  {backfill.error instanceof Error ? backfill.error.message : 'The questions could not be priced.'}
                </Alert>
              )}
              {backfill.isSuccess && pricedLater === 0 && backfill.data.questions > 0 && (
                <Alert severity="success">
                  Priced {backfill.data.questions} earlier question{backfill.data.questions === 1 ? '' : 's'} at
                  today&apos;s price.
                </Alert>
              )}
              <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="Currency"
                  value={currency}
                  onChange={(event) => setCurrencyDraft(event.target.value)}
                  error={!currencyValid}
                  helperText={currencyValid ? 'A three-letter code, such as USD or EUR' : 'Use three letters'}
                  slotProps={{ htmlInput: { maxLength: 3, style: { textTransform: 'uppercase' } } }}
                  sx={{ width: 150 }}
                />
                <Button
                  variant="contained"
                  onClick={save}
                  disabled={!changed || invalid || !currencyValid || savePrices.isPending}
                  sx={{ height: 40 }}
                >
                  Save prices
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => refreshPrices.mutate()}
                  disabled={changed || refreshPrices.isPending}
                  sx={{ height: 40 }}
                >
                  {refreshPrices.isPending ? 'Fetching…' : 'Refresh prices'}
                </Button>
              </Stack>
              {changed && (
                <Typography variant="caption" color="text.secondary">
                  Save your changes before refreshing prices.
                </Typography>
              )}
              {refreshPrices.isError && (
                <Alert severity="error">
                  {refreshPrices.error instanceof Error
                    ? refreshPrices.error.message
                    : 'The prices could not be fetched.'}
                </Alert>
              )}
              {refreshPrices.isSuccess && !changed && <RefreshSummary result={refreshPrices.data.refresh} />}
              {invalid && (
                <Alert severity="warning">
                  Give each model both an input and an output price, or leave both empty.
                </Alert>
              )}
              {savePrices.isError && (
                <Alert severity="error">
                  {savePrices.error instanceof Error ? savePrices.error.message : 'The prices could not be saved.'}
                </Alert>
              )}
              {savePrices.isSuccess && !changed && <Alert severity="success">Prices saved.</Alert>}
              {!priced && !savePrices.isSuccess && (
                <Typography variant="caption" color="text.secondary">
                  No prices are set yet, so only tokens are shown.
                </Typography>
              )}
            </Stack>
          </Panel>

          <Panel component="section" aria-label="By day">
            <Stack spacing={1} sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" component="h2">
                By day
              </Typography>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader aria-label="Usage by day">
                  <TableHead>
                    <TableRow>
                      <TableCell>Day</TableCell>
                      <TableCell align="right">Questions</TableCell>
                      <TableCell align="right">Tokens</TableCell>
                      <TableCell align="right">Cost</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...report.byDay].reverse().map((row) => (
                      <TableRow key={row.day}>
                        <TableCell sx={{ width: '40%' }}>
                          {day(row.day)}
                          <LinearProgress
                            variant="determinate"
                            aria-label={`${day(row.day)} compared with the busiest day`}
                            value={((byCost ? (row.cost ?? 0) : totalTokens(row)) / heaviestDay) * 100}
                            sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                          />
                        </TableCell>
                        <TableCell align="right">{number(row.questions)}</TableCell>
                        <TableCell align="right">{number(totalTokens(row))}</TableCell>
                        <TableCell align="right">{costCell(row, report.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          </Panel>

          <Panel component="section" aria-label="By person">
            <Stack spacing={1} sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" component="h2">
                By person
              </Typography>
              <TableContainer>
                <Table size="small" aria-label="Usage by person">
                  <TableHead>
                    <TableRow>
                      <TableCell>Person</TableCell>
                      <TableCell align="right">Questions</TableCell>
                      <TableCell align="right">Tokens</TableCell>
                      <TableCell align="right">Cost</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.byPerson.map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell>{row.name || 'Someone'}</TableCell>
                        <TableCell align="right">{number(row.questions)}</TableCell>
                        <TableCell align="right">{number(totalTokens(row))}</TableCell>
                        <TableCell align="right">{costCell(row, report.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          </Panel>
        </>
      )}
    </Stack>
  );
};

export default AnalystUsagePanel;
