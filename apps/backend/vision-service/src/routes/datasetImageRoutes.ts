import express from 'express';
import {
  createDatasetImage,
  getAllImages,
  getImagesByDataset,
  getImageById,
  updateImage,
  deleteImage,
  getAllImageStats,
  exportImageNames
} from '../controllers/datasetImageController';

const router = express.Router();

// Dataset image routes
router.get('/', getAllImages);
router.get('/dataset/:datasetId', getImagesByDataset);
router.get('/:id', getImageById);
router.post('/', createDatasetImage);
router.put('/:id', updateImage);
router.delete('/:id', deleteImage);
router.get('/export-names/:datasetId', exportImageNames);

export default router;