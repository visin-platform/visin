import React, { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { useRecentToolCalls, useToolUsage } from '../../hooks/useToolUsage';
import { ToolUsage } from '../../types/toolUsage';

const WINDOWS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last year' }
];

const number = (value: number): string => value.toLocaleString('en-US');

/** Milliseconds read badly past a second; seconds read badly below one. */
const duration = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

const time = (iso: string): string => new Date(iso).toLocaleString();

/**
 * The number a person is actually looking for.
 *
 * A tool result is re-sent with every message after it, so the tool to shrink
 * is the one with the largest total — not the one called most often. The bar
 * makes that ordering visible without anyone reading the figures.
 */
const UsageRow: React.FC<{ row: ToolUsage; worst: number }> = ({ row, worst }) => (
  <TableRow>
    <TableCell>
      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
        {row.tool}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={worst > 0 ? (row.totalTokens / worst) * 100 : 0}
        sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
      />
    </TableCell>
    <TableCell align="right">{number(row.calls)}</TableCell>
    <TableCell align="right">
      <strong>{number(row.totalTokens)}</strong>
    </TableCell>
    <TableCell align="right">{number(row.avgTokens)}</TableCell>
    <TableCell align="right">
      <Tooltip title={`Largest single answer: ${number(row.maxTokens)} tokens`}>
        <span>{number(row.maxTokens)}</span>
      </Tooltip>
    </TableCell>
    <TableCell align="right">{duration(row.avgMs)}</TableCell>
    <TableCell align="right">
      {row.failed > 0 ? <Chip size="small" color="warning" label={row.failed} /> : '—'}
    </TableCell>
  </TableRow>
);

const ToolUsageTab: React.FC = () => {
  const [days, setDays] = useState(30);

  const summary = useToolUsage(days);
  const recent = useRecentToolCalls();

  const usage = summary.data?.usage ?? [];
  const worst = usage[0]?.totalTokens ?? 0;
  const totalTokens = usage.reduce((sum, row) => sum + row.totalTokens, 0);
  const totalCalls = usage.reduce((sum, row) => sum + row.calls, 0);

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4, gap: 2 }}>
          <Box>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Assistant activity
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              What your connected assistants have called, and what each answer cost. A tool result
              stays in the conversation and is sent again with every later message, so the tool
              worth shrinking is the one with the largest total — not the one called most often.
            </Typography>
          </Box>
          <TextField
            select
            size="small"
            label="Window"
            value={days}
            onChange={event => setDays(Number(event.target.value))}
            sx={{ minWidth: 150, flexShrink: 0 }}
          >
            {WINDOWS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {summary.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : summary.error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {summary.error.message}
          </Alert>
        ) : usage.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No tool calls in this window. Connect an assistant and ask it about a project.
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              {number(totalCalls)} calls, about {number(totalTokens)} tokens over{' '}
              {summary.data?.windowDays} days.
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tool</TableCell>
                    <TableCell align="right">Calls</TableCell>
                    <TableCell align="right">Total tokens</TableCell>
                    <TableCell align="right">Avg</TableCell>
                    <TableCell align="right">Largest</TableCell>
                    <TableCell align="right">Avg time</TableCell>
                    <TableCell align="right">Failed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usage.map(row => (
                    <UsageRow key={row.tool} row={row} worst={worst} />
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 2, display: 'block' }}>
              Token counts are estimated at four characters each — close enough to tell an
              expensive tool from a cheap one, not a billing figure.
            </Typography>
          </>
        )}
      </Paper>

      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider', mt: 3 }}
      >
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Recent calls
        </Typography>

        {recent.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : recent.error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {recent.error.message}
          </Alert>
        ) : (recent.data?.length ?? 0) === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
            Nothing recorded yet.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Tool</TableCell>
                  <TableCell>By</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                  <TableCell align="right">Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recent.data?.map((call, index) => (
                  <TableRow key={`${call.at}-${index}`}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{time(call.at)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>
                      {call.tool}
                      {call.failed && (
                        <Chip size="small" color="warning" label="failed" sx={{ ml: 1 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      {call.actorLabel}
                      <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                        ({call.actorKind === 'oauth' ? 'connected app' : 'API key'})
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{number(call.tokens)}</TableCell>
                    <TableCell align="right">{duration(call.ms)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default ToolUsageTab;
