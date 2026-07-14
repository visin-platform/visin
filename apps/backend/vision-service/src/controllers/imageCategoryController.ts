import { Request, Response } from 'express';
import * as imageCategoryService from '../services/imageCategoryService';

export const createImageCategory = async (req: Request, res: Response): Promise<void> => {
  const savedCategory = await imageCategoryService.createImageCategory(req.body);

  res.status(201).json({
    success: true,
    message: 'Image category created successfully',
    data: savedCategory
  });
};

export const getCategoriesByDataset = async (req: Request, res: Response): Promise<void> => {
  const { datasetId } = req.params as { datasetId: string };
  const categories = await imageCategoryService.getCategoriesByDataset(datasetId);
  res.json({
    success: true,
    data: categories
  });
};

export const getAllCategories = async (req: Request, res: Response): Promise<void> => {
  const categories = await imageCategoryService.getAllCategories();

  res.json({
    success: true,
    data: categories
  });
};

export const getCategoryById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const category = await imageCategoryService.getCategoryById(id);

  res.json({
    success: true,
    data: category
  });
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const category = await imageCategoryService.updateCategory(id, req.body);

  res.json({
    success: true,
    message: 'Image category updated successfully',
    data: category
  });
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  await imageCategoryService.deleteCategory(id);

  res.json({
    success: true,
    message: 'Image category deleted successfully'
  });
};
