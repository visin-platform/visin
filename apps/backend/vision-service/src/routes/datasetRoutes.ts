import express from 'express';
import {
  getDatasets,
  getDatasetById,
  getDatasetByUuid,
  createDataset,
  getLabelingStats,
  downloadDataset,
  getSignedUrlForPath
} from '../controllers/datasetController';

const router = express.Router();

// Dataset routes
router.get('/', getDatasets);
router.get('/labeling-stats', getLabelingStats);
router.get('/signed-url', getSignedUrlForPath);
router.get('/:id', getDatasetById);
router.get('/uuid/:uuid', getDatasetByUuid);
router.post('/', createDataset);
router.get('/download/:uuid', downloadDataset);

export default router;
