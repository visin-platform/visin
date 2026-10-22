import React from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { preprocessingText, storedModelBlock, storedModelFileUrl, storedModelOutputsPath } from '../../providers/visin';
import type { StoredModelReference } from '../../types/training';
import { formatBytes } from '../../utils/datasetMapping';
import { servableModel } from '../../utils/modelLinks';

interface StoredModelDownloadsProps {
  trainingId: string;
  /** the formats of one checkpoint: its `.pth` and its `.onnx` export */
  models: StoredModelReference[];
  compact?: boolean;
  detailsOnly?: boolean;
}

/**
 * The downloads of a model kept on this deployment: one link per format, with its size; a link to what it produced;
 * the licence it is shared under; and what to do to an input. A format that cannot be served says why (still being read, failed, no licence
 * stated) instead of offering a link that would answer 409.
 *
 * The weights are a plain link, so the browser sends the session along and a private run's model downloads for
 * whoever may read the run.
 */
const StoredModelDownloads: React.FC<StoredModelDownloadsProps> = ({ trainingId, models, compact = false, detailsOnly = false }) => {
  const ordered = [...models].sort((a, b) => a.format.localeCompare(b.format));
  const license = ordered.find((model) => model.license)?.license;
  const credit = ordered.find((model) => model.credit)?.credit;
  const info = ordered.find((model) => model.modelInfo)?.modelInfo;
  // The outputs belong to the checkpoint, not to one of its formats.
  const servable = servableModel(ordered);
  const preprocessing = preprocessingText(info);

  return (
    <Box component="span" sx={{ display: 'block' }}>
      {!detailsOnly && <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, alignItems: 'baseline' }}>
        {ordered.map((model) => {
          const block = storedModelBlock(model);
          const size = model.size === undefined ? '' : ` · ${formatBytes(model.size)}`;
          return block ? (
            <Typography key={model._id} variant="body2" component="span" sx={{ color: 'text.secondary' }}>
              {model.status === 'verifying' && (
                <CircularProgress size={12} aria-label="Verifying model" sx={{ mr: 0.5 }} />
              )}
              .{model.format}
              {size} · {block}
            </Typography>
          ) : (
            <Link
              key={model._id}
              href={storedModelFileUrl(trainingId, model._id)}
              download
              aria-label={`Download ${model.filename ?? model.format} (${model.format})`}
            >
              .{model.format}
              {size}
            </Link>
          );
        })}
        {servable && (
          <Link
            component={RouterLink}
            to={storedModelOutputsPath(trainingId, servable._id)}
            variant="caption"
            aria-label={`View the outputs of ${servable.filename ?? 'this model'}`}
          >
            Outputs
          </Link>
        )}
      </Box>}
      {!compact && <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
        {license ? `Licence ${license.name ?? license.id}` : 'Licence not stated'}
        {credit ? ` · ${credit}` : ''}
      </Typography>}
      {!compact && preprocessing && (
        <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
          {preprocessing}
        </Typography>
      )}
    </Box>
  );
};

export default StoredModelDownloads;
