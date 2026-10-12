import React from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import { preprocessingText, storedModelBlock, storedModelBundleUrl, storedModelFileUrl } from '../../providers/visin';
import type { StoredModelReference } from '../../types/training';
import { formatBytes } from '../../utils/datasetMapping';

interface StoredModelDownloadsProps {
  trainingId: string;
  /** the formats of one checkpoint: its `.pth` and its `.onnx` export */
  models: StoredModelReference[];
}

/**
 * The downloads of a model kept on this deployment: one link per format, with its size; the licence it is shared
 * under; and what to do to an input. A format that cannot be served says why (still being read, failed, no licence
 * stated) instead of offering a link that would answer 409.
 *
 * The weights are a plain link, so the browser sends the session along and a private run's model downloads for
 * whoever may read the run.
 */
const StoredModelDownloads: React.FC<StoredModelDownloadsProps> = ({ trainingId, models }) => {
  const ordered = [...models].sort((a, b) => a.format.localeCompare(b.format));
  const license = ordered.find((model) => model.license)?.license;
  const credit = ordered.find((model) => model.credit)?.credit;
  const info = ordered.find((model) => model.modelInfo)?.modelInfo;
  // The outputs belong to the checkpoint; name them after the `.pth` the export was made from when it can be served.
  const servable =
    ordered.find((model) => model.format === 'pth' && !storedModelBlock(model)) ??
    ordered.find((model) => !storedModelBlock(model));
  const preprocessing = preprocessingText(info);

  return (
    <Box component="span" sx={{ display: 'block' }}>
      <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, alignItems: 'baseline' }}>
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
            href={storedModelBundleUrl(trainingId, servable._id)}
            download
            variant="caption"
            aria-label={`Download the outputs of ${servable.filename ?? 'this model'} as a zip`}
          >
            Outputs (.zip)
          </Link>
        )}
      </Box>
      <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
        {license ? `Licence ${license.name ?? license.id}` : 'Licence not stated'}
        {credit ? ` · ${credit}` : ''}
      </Typography>
      {preprocessing && (
        <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
          {preprocessing}
        </Typography>
      )}
    </Box>
  );
};

export default StoredModelDownloads;
