import React from 'react';
import { Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import ModelRegistry from '../models/ModelRegistry';
import { modelService } from '../../services/modelService';

interface DatasetModelsProps {
  datasetId: string;
}

/**
 * The models of the runs trained on a dataset, so the page that holds the data also says what came out of it and
 * where to download it. Nothing is drawn for a dataset no run has produced a model from: it asks for one row first.
 */
const DatasetModels: React.FC<DatasetModelsProps> = ({ datasetId }) => {
  const { data } = useQuery({
    queryKey: ['model-registry', 'dataset-has-models', datasetId],
    queryFn: () => modelService.list({ datasetId, page: 1, limit: 1 })
  });
  if (!data || data.pagination.total === 0) return null;
  return (
    <Box sx={{ mt: 3 }}>
      <ModelRegistry datasetId={datasetId} title="Models trained on this dataset" />
    </Box>
  );
};

export default DatasetModels;
