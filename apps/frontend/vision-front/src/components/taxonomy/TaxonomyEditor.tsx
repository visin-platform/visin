import React from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  TextField,
  Typography,
  Tooltip
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
  MetricDirection,
  ProjectTaxonomy,
  TaskType,
  TaxonomyMetric,
  TaxonomyTerm
} from '../../types/taxonomy';
import { humanize } from '../../taxonomy/humanize';

/**
 * Optional per-project display settings.
 *
 * Everything here only *decorates* what the data already contains — nothing typed
 * in this form restricts what a training pipeline may report. That matters because
 * results almost always arrive over the API from a pipeline that has never seen
 * this form; leaving it entirely blank is a perfectly good answer, and the app
 * then names conditions and classes after whatever turns up.
 */

const TASK_TYPES: { value: TaskType; label: string; hint: string }[] = [
  { value: 'segmentation', label: 'Segmentation', hint: 'IoU, mIoU, pixel accuracy' },
  { value: 'detection', label: 'Detection', hint: 'AP, mAP@50, mAP@50-95' },
  { value: 'classification', label: 'Classification', hint: 'accuracy, top-1, top-5' },
  { value: 'other', label: 'Other / not sure', hint: 'no presets; everything is discovered' }
];

const DIRECTIONS: { value: MetricDirection; label: string }[] = [
  { value: 'higher', label: 'Higher is better' },
  { value: 'lower', label: 'Lower is better' }
];

interface TaxonomyEditorProps {
  value: ProjectTaxonomy;
  onChange: (taxonomy: ProjectTaxonomy) => void;
  disabled?: boolean;
  /** conditions/classes seen in this project's data, offered as a starting point */
  discovered?: { conditions?: string[]; classes?: string[] };
  /** hides the metric table — the create dialog keeps things short */
  compact?: boolean;
}

const TermRows: React.FC<{
  label: string;
  terms: TaxonomyTerm[];
  onChange: (terms: TaxonomyTerm[]) => void;
  disabled?: boolean;
  discovered?: string[];
}> = ({ label, terms, onChange, disabled, discovered = [] }) => {
  const update = (index: number, patch: Partial<TaxonomyTerm>) =>
    onChange(terms.map((term, i) => (i === index ? { ...term, ...patch } : term)));

  const missing = discovered.filter(key => !terms.some(term => term.key === key));

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {missing.length > 0 && (
            <Tooltip title="Add the values already present in this project's data">
              <Button
                size="small"
                onClick={() => onChange([...terms, ...missing.map(key => ({ key }))])}
                disabled={disabled}
              >
                Add {missing.length} from data
              </Button>
            </Tooltip>
          )}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => onChange([...terms, { key: '' }])}
            disabled={disabled}
          >
            Add
          </Button>
        </Box>
      </Box>
      {terms.length === 0 ? (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          None configured — taken from your data and named automatically.
        </Typography>
      ) : (
        terms.map((term, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Key (as reported)"
              value={term.key}
              onChange={e => update(index, { key: e.target.value })}
              disabled={disabled}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Display name"
              value={term.label ?? ''}
              placeholder={term.key ? humanize(term.key) : ''}
              onChange={e => update(index, { label: e.target.value || undefined })}
              disabled={disabled}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="color"
              label="Colour"
              value={term.color ?? '#1976d2'}
              onChange={e => update(index, { color: e.target.value })}
              disabled={disabled}
              sx={{ width: 90 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <IconButton
              size="small"
              onClick={() => onChange(terms.filter((_, i) => i !== index))}
              disabled={disabled}
              aria-label={`Remove ${term.key || 'entry'}`}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))
      )}
    </Box>
  );
};

const MetricRows: React.FC<{
  metrics: TaxonomyMetric[];
  onChange: (metrics: TaxonomyMetric[]) => void;
  disabled?: boolean;
}> = ({ metrics, onChange, disabled }) => {
  const update = (index: number, patch: Partial<TaxonomyMetric>) =>
    onChange(metrics.map((metric, i) => (i === index ? { ...metric, ...patch } : metric)));

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Metrics</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onChange([...metrics, { key: '', direction: 'higher' }])}
          disabled={disabled}
        >
          Add
        </Button>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
        Direction is the one thing your data cannot say. Set it for anything where a
        lower number is better — a loss, an error rate, a latency — or the best value
        gets highlighted the wrong way round.
      </Typography>
      {metrics.map((metric, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            label="Key (as reported)"
            value={metric.key}
            onChange={e => update(index, { key: e.target.value })}
            disabled={disabled}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="Display name"
            value={metric.label ?? ''}
            placeholder={metric.key ? humanize(metric.key) : ''}
            onChange={e => update(index, { label: e.target.value || undefined })}
            disabled={disabled}
            sx={{ flex: 1 }}
          />
          <TextField
            select
            size="small"
            label="Direction"
            value={metric.direction ?? 'higher'}
            onChange={e => update(index, { direction: e.target.value as MetricDirection })}
            disabled={disabled}
            sx={{ minWidth: 160 }}
          >
            {DIRECTIONS.map(d => (
              <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="number"
            label="Decimals"
            value={metric.decimals ?? 4}
            onChange={e => update(index, { decimals: Number(e.target.value) })}
            disabled={disabled}
            sx={{ width: 100 }}
          />
          <IconButton
            size="small"
            onClick={() => onChange(metrics.filter((_, i) => i !== index))}
            disabled={disabled}
            aria-label={`Remove ${metric.key || 'metric'}`}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
};

export const TaxonomyEditor: React.FC<TaxonomyEditorProps> = ({
  value,
  onChange,
  disabled,
  discovered,
  compact = false
}) => {
  const patch = (fields: Partial<ProjectTaxonomy>) => onChange({ ...value, ...fields });

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
        All optional. Anything you leave blank is read from your results, so a project
        fed entirely through the API works without filling in any of this.
      </Typography>

      <TextField
        select
        fullWidth
        size="small"
        label="Task type"
        value={value.taskType ?? ''}
        onChange={e => patch({ taskType: (e.target.value || undefined) as TaskType | undefined })}
        disabled={disabled}
        helperText="Only seeds sensible metric defaults; it never limits what you can report."
        sx={{ mb: 2 }}
      >
        <MenuItem value="">
          <em>Not set</em>
        </MenuItem>
        {TASK_TYPES.map(t => (
          <MenuItem key={t.value} value={t.value}>
            {t.label} — {t.hint}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        fullWidth
        size="small"
        label="Name for the condition axis"
        value={value.conditionLabel ?? ''}
        onChange={e => patch({ conditionLabel: e.target.value || undefined })}
        disabled={disabled}
        placeholder="Condition"
        helperText='What your results are grouped by — "Weather", "Scenario", "Site", "Split"…'
        sx={{ mb: 3 }}
      />

      <Divider sx={{ mb: 2 }} />

      <TermRows
        label={`${value.conditionLabel || 'Condition'}s`}
        terms={value.conditions ?? []}
        onChange={conditions => patch({ conditions: conditions.length ? conditions : undefined })}
        disabled={disabled}
        discovered={discovered?.conditions}
      />

      <TermRows
        label="Classes"
        terms={value.classes ?? []}
        onChange={classes => patch({ classes: classes.length ? classes : undefined })}
        disabled={disabled}
        discovered={discovered?.classes}
      />

      {!compact && (
        <>
          <Divider sx={{ mb: 2 }} />
          <MetricRows
            metrics={value.metrics ?? []}
            onChange={metrics => patch({ metrics: metrics.length ? metrics : undefined })}
            disabled={disabled}
          />
          <TextField
            fullWidth
            size="small"
            label="Summary metrics"
            value={(value.overallMetrics ?? []).join(', ')}
            onChange={e =>
              patch({
                overallMetrics: e.target.value
                  .split(',')
                  .map(key => key.trim())
                  .filter(Boolean)
              })
            }
            disabled={disabled}
            helperText="Comma-separated keys from each result's `overall` block, in display order."
          />
        </>
      )}
    </Box>
  );
};

export default TaxonomyEditor;
