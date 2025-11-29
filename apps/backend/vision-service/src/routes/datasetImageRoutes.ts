import express from 'express';
import {
  createDatasetImage,
  getAllImages,
  getImagesByDataset,
  getImagesByCategory,
  exportImagesByLabels,
  getImageById,
  updateImage,
  deleteImage,
  getUploadSignedUrlRequest,
  exportImageNames,
  getLabelingStats,
  getAllImageStats
} from '../controllers/datasetImageController';

const router = express.Router();

// Dataset image routes
router.get('/', getAllImages);
router.get('/labeling-stats', getLabelingStats);
router.get('/dataset/:datasetId', getImagesByDataset);
router.get('/dataset/:datasetId/category/:categoryId', getImagesByCategory);
router.get('/dataset/:datasetId/export/csv', exportImagesByLabels);
router.get('/export-names/:datasetId', exportImageNames);
router.get('/:id', getImageById);
router.post('/', createDatasetImage);
router.put('/:id', updateImage);
router.delete('/:id', deleteImage);

// Upload signed URL
router.post('/upload-url', getUploadSignedUrlRequest);

export default router;