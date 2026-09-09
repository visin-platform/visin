import React from 'react';
import { Alert, Box, MenuItem, TextField, Typography } from '@mui/material';
import { ProjectCosting } from '../../types/taxonomy';
import { formatCost, resolveCosting } from '../../costing/costing';

/**
 * Hourly rates for this project's hardware.
 *
 * Left blank, the project reports no cost at all — which is the honest answer,
 * since the platform has no way to know what your compute costs. Filling these in
 * is what turns measured hours into money.
 */

// Common enough to save typing; any ISO 4217 code the browser knows will format.
const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'PLN', 'CHF', 'CAD', 'AUD', 'JPY', 'INR'];

interface CostingEditorProps {
  value: ProjectCosting;
  onChange: (costing: ProjectCosting) => void;
  disabled?: boolean;
}

/** Empty string clears the field; anything unparseable is ignored. */
const asRate = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export const CostingEditor: React.FC<CostingEditorProps> = ({ value, onChange, disabled }) => {
  const patch = (fields: Partial<ProjectCosting>) => onChange({ ...value, ...fields });
  const resolved = resolveCosting(value);

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
        Optional. Leave blank and this project simply does not show costs — training
        time is still recorded either way.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          type="number"
          label="CPU rate per hour"
          value={value.cpuRatePerHour ?? ''}
          onChange={e => patch({ cpuRatePerHour: asRate(e.target.value) })}
          disabled={disabled}
          slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
          sx={{ flex: '1 1 160px' }}
        />
        <TextField
          size="small"
          type="number"
          label="GPU rate per hour"
          value={value.gpuRatePerHour ?? ''}
          onChange={e => patch({ gpuRatePerHour: asRate(e.target.value) })}
          disabled={disabled}
          slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
          sx={{ flex: '1 1 160px' }}
        />
        <TextField
          select
          size="small"
          label="Currency"
          value={value.currency ?? 'EUR'}
          onChange={e => patch({ currency: e.target.value })}
          disabled={disabled}
          sx={{ flex: '1 1 120px' }}
        >
          {CURRENCIES.map(code => (
            <MenuItem key={code} value={code}>{code}</MenuItem>
          ))}
        </TextField>
      </Box>

      {resolved ? (
        <Alert severity="success" variant="outlined">
          A 10-hour training would cost{' '}
          <strong>{formatCost(10 * (resolved.cpuRatePerHour + resolved.gpuRatePerHour), resolved.currency)}</strong>{' '}
          — CPU {formatCost(10 * resolved.cpuRatePerHour, resolved.currency)}, GPU{' '}
          {formatCost(10 * resolved.gpuRatePerHour, resolved.currency)}.
        </Alert>
      ) : (
        <Alert severity="info" variant="outlined">
          {value.cpuRatePerHour !== undefined || value.gpuRatePerHour !== undefined
            ? 'Set both rates to show costs — pricing one without the other would bill half the machine.'
            : 'No rates set, so this project shows no costs.'}
        </Alert>
      )}
    </Box>
  );
};

export default CostingEditor;
