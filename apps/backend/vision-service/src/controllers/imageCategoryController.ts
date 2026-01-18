import { Request, Response } from 'express';
import ImageCategory from '../models/ImageCategory';

export const createImageCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, datasetId, color } = req.body;

    // Validate required fields
    if (!name || !datasetId) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: name, datasetId'
      });
      return;
    }

    // Check if category with this name already exists for the dataset
    const existingCategory = await ImageCategory.findOne({ datasetId, name: name.trim() });
    if (existingCategory) {
      res.status(409).json({
        success: false,
        message: 'Category with this name already exists for this dataset'
      });
      return;
    }

    const category = new ImageCategory({
      name: name.trim(),
      description: description?.trim(),
      datasetId,
      color: color?.trim()
    });

    const savedCategory = await category.save();

    console.info(`Image category created: ${savedCategory._id}`, {
      datasetId,
      name: savedCategory.name
    });

    res.status(201).json({
      success: true,
      message: 'Image category created successfully',
      data: savedCategory
    });
  } catch (error) {
    console.error('Error creating image category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create image category'
    });
  }
};

export const getCategoriesByDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;

    const categories = await ImageCategory.find({ datasetId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching image categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch image categories'
    });
  }
};

export const getAllCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await ImageCategory.find({}).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching all image categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch image categories'
    });
  }
};

export const getCategoryById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await ImageCategory.findById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: 'Image category not found'
      });
      return;
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error fetching image category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch image category'
    });
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name, description, color } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name?.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (color !== undefined) updateData.color = color?.trim();

    // If updating name, check for uniqueness
    if (name) {
      const category = await ImageCategory.findById(id);
      if (category) {
        const existingCategory = await ImageCategory.findOne({
          datasetId: category.datasetId,
          name: name.trim(),
          _id: { $ne: id }
        });
        if (existingCategory) {
          res.status(409).json({
            success: false,
            message: 'Category with this name already exists for this dataset'
          });
          return;
        }
      }
    }

    const category = await ImageCategory.findByIdAndUpdate(id, updateData, { new: true });

    if (!category) {
      res.status(404).json({
        success: false,
        message: 'Image category not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Image category updated successfully',
      data: category
    });
  } catch (error) {
    console.error('Error updating image category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update image category'
    });
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await ImageCategory.findById(id);
    if (!category) {
      res.status(404).json({
        success: false,
        message: 'Image category not found'
      });
      return;
    }

    // Check if category is being used by any images
    const DatasetImage = require('../models/DatasetImage').default;
    const imagesCount = await DatasetImage.countDocuments({ categoryId: id });

    if (imagesCount > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete category. It is being used by ${imagesCount} image(s).`
      });
      return;
    }

    await ImageCategory.findByIdAndDelete(id);

    console.info(`Image category deleted: ${id}`, {
      datasetId: category.datasetId,
      name: category.name
    });

    res.json({
      success: true,
      message: 'Image category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting image category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image category'
    });
  }
};