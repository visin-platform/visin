import { Request, Response } from 'express';
import { UpdateQuery } from 'mongoose';
import { ConflictError, NotFoundError, logger } from '@visin/backend-core';
import ImageCategory, { IImageCategory } from '../models/ImageCategory';
import DatasetImage from '../models/DatasetImage';

export const createImageCategory = async (req: Request, res: Response): Promise<void> => {
  const { name, description, datasetId, color } = req.body;

  // Check if category with this name already exists for the dataset
  const existingCategory = await ImageCategory.findOne({ datasetId, name });
  if (existingCategory) {
    throw new ConflictError('Category with this name already exists for this dataset');
  }

  const category = new ImageCategory({
    name,
    description,
    datasetId,
    color
  });

  const savedCategory = await category.save();

  logger.info('Image category created', {
    id: savedCategory._id,
    datasetId,
    name: savedCategory.name
  });

  res.status(201).json({
    success: true,
    message: 'Image category created successfully',
    data: savedCategory
  });
};

export const getCategoriesByDataset = async (req: Request, res: Response): Promise<void> => {
  const { datasetId } = req.params;

  const categories = await ImageCategory.find({ datasetId }).sort({ createdAt: -1 });
  res.json({
    success: true,
    data: categories
  });
};

export const getAllCategories = async (req: Request, res: Response): Promise<void> => {
  const categories = await ImageCategory.find({}).sort({ createdAt: -1 });

  res.json({
    success: true,
    data: categories
  });
};

export const getCategoryById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const category = await ImageCategory.findById(id);

  if (!category) {
    throw new NotFoundError('Image category not found');
  }

  res.json({
    success: true,
    data: category
  });
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { name, description, color } = req.body;

  const updateData: UpdateQuery<IImageCategory> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (color !== undefined) updateData.color = color;

  // If updating name, check for uniqueness
  if (name) {
    const category = await ImageCategory.findById(id);
    if (category) {
      const existingCategory = await ImageCategory.findOne({
        datasetId: category.datasetId,
        name,
        _id: { $ne: id }
      });
      if (existingCategory) {
        throw new ConflictError('Category with this name already exists for this dataset');
      }
    }
  }

  const category = await ImageCategory.findByIdAndUpdate(id, updateData, { new: true });
  if (!category) {
    throw new NotFoundError('Image category not found');
  }

  res.json({
    success: true,
    message: 'Image category updated successfully',
    data: category
  });
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const category = await ImageCategory.findById(id);
  if (!category) {
    throw new NotFoundError('Image category not found');
  }

  // Check if category is being used by any images
  const imagesCount = await DatasetImage.countDocuments({ categoryId: id });

  if (imagesCount > 0) {
    throw new ConflictError(`Cannot delete category. It is being used by ${imagesCount} image(s).`);
  }

  await ImageCategory.findByIdAndDelete(id);

  logger.info('Image category deleted', {
    id,
    datasetId: category.datasetId,
    name: category.name
  });

  res.json({
    success: true,
    message: 'Image category deleted successfully'
  });
};
