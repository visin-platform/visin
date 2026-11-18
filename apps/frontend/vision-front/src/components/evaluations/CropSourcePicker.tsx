import React from 'react';
import { Alert, Box, MenuItem, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { listDatasets } from '../../services/datasetService';
import LicenseChip from '../licensing/LicenseChip';

export interface CropSource {
  datasetId: string;
  group: string;
}

/**
 * Where crops are cut from: an image dataset and one of its groups, chosen by the reader. Frames are matched by name,
 * so the dataset's terms are shown beside the choice and the match is said to be unverified.
 */
const CropSourcePicker: React.FC<{ value: CropSource; onChange: (value: CropSource) => void }> = ({ value, onChange }) => {
  const datasets = useQuery({ queryKey: ['judge-image-datasets'], queryFn: () => listDatasets({ page: 1, limit: 100 }) });
  const dataset = datasets.data?.datasets.find((item) => item._id === value.datasetId);
  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <TextField
          select
          size="small"
          label="Image dataset"
          value={value.datasetId}
          onChange={(event) => onChange({ datasetId: event.target.value, group: '' })}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">
            <em>No dataset selected</em>
          </MenuItem>
          {(datasets.data?.datasets ?? []).map((item) => (
            <MenuItem key={item._id} value={item._id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Image group"
          value={value.group}
          onChange={(event) => onChange({ ...value, group: event.target.value })}
          disabled={!dataset}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">
            <em>Choose a group</em>
          </MenuItem>
          {(dataset?.groups ?? [])
            .filter((item) => item.images > 0)
            .map((item) => (
              <MenuItem key={item.name} value={item.name}>
                {item.name} ({item.images.toLocaleString()})
              </MenuItem>
            ))}
        </TextField>
      </Box>
      {datasets.isError && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Image datasets could not be loaded. Decisions are still available.
        </Alert>
      )}
      {(datasets.data?.pagination.pages ?? 0) > 1 && (
        <Typography variant="caption" color="text.secondary">
          The dataset picker shows the first 100 accessible datasets.
        </Typography>
      )}
      {dataset && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }} aria-label="Terms of the selected image dataset">
          <Typography variant="body2" color="text.secondary">
            Image dataset licence
          </Typography>
          <LicenseChip license={dataset.license} />
          {dataset.credit && (
            <Typography variant="body2" color="text.secondary">
              · Credit: {dataset.credit}
            </Typography>
          )}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Crops use recorded bounding boxes in original-image pixels. Frames are matched by name in the selected dataset; that
        match is not verified against the suite. An unavailable frame or box is shown as missing.
      </Typography>
    </>
  );
};

export default CropSourcePicker;
