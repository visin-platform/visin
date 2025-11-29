import express from 'express';
import {
  createImageCategory,
  getCategoriesByDataset,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from '../controllers/imageCategoryController';

const router = express.Router();

// Image category routes
router.get('/', getAllCategories);
router.get('/dataset/:datasetId', getCategoriesByDataset);
router.get('/:id', getCategoryById);
router.post('/', createImageCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;