import express from 'express';
import {
  getVisualizationUploadUrl,
  createVisualization,
  getVisualizationsByEpoch,
  getVisualizationsByTraining,
  getVisualizationByUuid,
  deleteVisualization,
  getVisualizationTypes
} from '../controllers/visualizationController';

const router = express.Router();

// Visualization routes
router.post('/upload-url', getVisualizationUploadUrl);
router.post('/', createVisualization);
router.get('/epoch/:epoch_uuid', getVisualizationsByEpoch);
router.get('/training/:training_uuid', getVisualizationsByTraining);
router.get('/training', getVisualizationsByTraining); // For fetching all visualizations
router.get('/types', getVisualizationTypes);
router.get('/:visualization_uuid', getVisualizationByUuid);
router.delete('/:visualization_uuid', deleteVisualization);

export default router;
