import express from 'express';
import {
  createImageCategory,
  getCategoriesByDataset,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from '../controllers/imageCategoryController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { createImageCategoryBodySchema, updateCategoryBodySchema } from '../validation/imageCategorySchemas';

const router = express.Router();

// Image categories are a shared library (no owner/project scoping), so reads
// stay public; writes require a logged-in user.
router.get('/', getAllCategories);
router.get('/dataset/:datasetId', getCategoriesByDataset);
router.get('/:id', getCategoryById);
router.post('/', authMiddleware, validateRequest({ body: createImageCategoryBodySchema }), createImageCategory);
router.put('/:id', authMiddleware, validateRequest({ body: updateCategoryBodySchema }), updateCategory);
router.delete('/:id', authMiddleware, deleteCategory);

export default router;