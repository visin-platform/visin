import { assertDatasetWrite } from './writeAccessService';
import { UpdateQuery } from 'mongoose';
import { ConflictError, NotFoundError, logger } from '@visin/backend-core';
import ImageCategory, { IImageCategory } from '../models/ImageCategory';
import DatasetImage from '../models/DatasetImage';

interface CreateImageCategoryData {
  name: string;
  description?: string;
  datasetId: string;
  color?: string;
}

interface UpdateImageCategoryData {
  name?: string;
  description?: string;
  color?: string;
}

export const createImageCategory = async ({ name, description, datasetId, color }: CreateImageCategoryData, userId?: string) => {
  await assertDatasetWrite(datasetId, userId);
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

  return savedCategory;
};

export const getCategoriesByDataset = (datasetId: string) =>
  ImageCategory.find({ datasetId }).sort({ createdAt: -1 });

export const getAllCategories = () => ImageCategory.find({}).sort({ createdAt: -1 });

export const getCategoryById = async (id: string) => {
  const category = await ImageCategory.findById(id);

  if (!category) {
    throw new NotFoundError('Image category not found');
  }

  return category;
};

export const updateCategory = async (id: string, { name, description, color }: UpdateImageCategoryData, userId?: string) => {
  const current = await getCategoryById(id);
  await assertDatasetWrite(current.datasetId.toString(), userId);
  const updateData: UpdateQuery<IImageCategory> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (color !== undefined) updateData.color = color;

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

  return category;
};

export const deleteCategory = async (id: string, userId?: string) => {
  const category = await ImageCategory.findById(id);
  if (!category) {
    throw new NotFoundError('Image category not found');
  }

  await assertDatasetWrite(category.datasetId.toString(), userId);
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
};
