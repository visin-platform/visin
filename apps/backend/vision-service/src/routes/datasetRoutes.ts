import express from 'express';
import {
  getDatasets,
  getDatasetById,
  getDatasetByUuid,
  createDataset,
  updateDataset,
  deleteDataset
} from '../controllers/datasetController';

const router = express.Router();

// Dataset routes
router.get('/', getDatasets);
router.get('/:id', getDatasetById);
router.get('/uuid/:uuid', getDatasetByUuid);
router.post('/', createDataset);
router.put('/:id', updateDataset);
router.delete('/:id', deleteDataset);

export default router;
