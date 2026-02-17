import express from 'express';
import {
  getDatasets,
  getDatasetById,
  getDatasetByUuid,
  createDataset,
  getLabelingStats
} from '../controllers/datasetController';

const router = express.Router();

// Dataset routes
router.get('/', getDatasets);
router.get('/labeling-stats', getLabelingStats);
router.get('/:id', getDatasetById);
router.get('/uuid/:uuid', getDatasetByUuid);
router.post('/', createDataset);

export default router;
