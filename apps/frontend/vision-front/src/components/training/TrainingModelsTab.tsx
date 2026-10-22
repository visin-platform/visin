import React from 'react';
import { Alert, MenuItem, TextField } from '@mui/material';
import ModelOutputsPanel from '../models/ModelOutputsPanel';
import { storedModelBlock, storedModelLabel } from '../../providers/visin';
import type { ModelReference, StoredModelReference } from '../../types/training';
import { servableModel, storedCheckpoints } from '../../utils/modelLinks';

interface TrainingModelsTabProps {
  trainingId: string;
  models: ModelReference[];
  /** any format's id of the checkpoint to show; the first that can be served when unset or unknown */
  selectedModelId?: string | null;
  onSelectModel: (modelId: string) => void;
  onShowTab: (tab: 'epochs') => void;
}

/** A checkpoint to choose by: the file its outputs are described from, and its epoch. */
const checkpointLabel = (checkpoint: StoredModelReference[]) => {
  const label = storedModelLabel(servableModel(checkpoint) ?? checkpoint[0]);
  return checkpoint[0].epoch === undefined ? label : `${label} · epoch ${checkpoint[0].epoch}`;
};

/**
 * The models this deployment keeps for a run, one checkpoint at a time: what it is, what it was trained and run on,
 * and what it produced. A `.pth` and the ONNX export made from it are one checkpoint.
 */
const TrainingModelsTab: React.FC<TrainingModelsTabProps> = ({ trainingId, models, selectedModelId, onSelectModel, onShowTab }) => {
  const checkpoints = storedCheckpoints(models);
  const named = checkpoints.find((checkpoint) => checkpoint.some((model) => model._id === selectedModelId));
  const selected = named ?? checkpoints.find((checkpoint) => servableModel(checkpoint)) ?? checkpoints[0];
  if (!selected) return <Alert severity="info">This run keeps no model on Visin.</Alert>;
  const servable = servableModel(selected);

  return (
    <>
      {selectedModelId && !named && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          This run no longer keeps the model the link named; showing {checkpointLabel(selected)} instead.
        </Alert>
      )}
      {checkpoints.length > 1 && (
        <TextField
          select
          size="small"
          label="Checkpoint"
          value={selected[0]._id}
          onChange={(event) => onSelectModel(event.target.value)}
          sx={{ mb: 3, minWidth: { xs: '100%', sm: 360 } }}
        >
          {checkpoints.map((checkpoint) => (
            <MenuItem key={checkpoint[0]._id} value={checkpoint[0]._id}>
              {checkpointLabel(checkpoint)}
            </MenuItem>
          ))}
        </TextField>
      )}
      {servable ? (
        <ModelOutputsPanel key={servable._id} trainingId={trainingId} modelId={servable._id} onShowTab={onShowTab} />
      ) : (
        <Alert severity="info">
          {storedModelLabel(selected[0])}: {storedModelBlock(selected[0])}. Its outputs show here once it can be served.
        </Alert>
      )}
    </>
  );
};

export default TrainingModelsTab;
