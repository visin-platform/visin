import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Dataset from '../models/Dataset';

// Get all datasets
export const getDatasets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search, sortBy = 'updatedAt', order = 'desc' } = req.query;

    let query: any = { deletedAt: null };

    // Search functionality
    if (search) {
      query.$text = { $search: search as string };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy as string;

    const [datasets, total] = await Promise.all([
      Dataset.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(Number(limit)),
      Dataset.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        datasets,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching datasets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch datasets'
    });
  }
};

// Get dataset by ID
export const getDatasetById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const dataset = await Dataset.findOne({ _id: id, deletedAt: null });

    if (!dataset) {
      res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
      return;
    }

    res.json({
      success: true,
      data: dataset
    });
  } catch (error) {
    console.error('Error fetching dataset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dataset'
    });
  }
};

// Get dataset by UUID
export const getDatasetByUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;

    const dataset = await Dataset.findOne({ uuid, deletedAt: null });

    if (!dataset) {
      res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
      return;
    }

    res.json({
      success: true,
      data: dataset
    });
  } catch (error) {
    console.error('Error fetching dataset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dataset'
    });
  }
};

// Create dataset
export const createDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, timestamp, dataset_info, annotations, camera, lidar, metadata } = req.body;

    if (!name || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Dataset name is required'
      });
      return;
    }

    // Generate UUID if not provided
    const uuid = req.body.uuid || uuidv4();

    const dataset = new Dataset({
      uuid,
      name: name.trim(),
      description: description?.trim(),
      timestamp: timestamp || new Date(),
      dataset_info,
      annotations,
      camera,
      lidar,
      metadata
    });

    const savedDataset = await dataset.save();

    res.status(201).json({
      success: true,
      message: 'Dataset created successfully',
      data: savedDataset
    });
  } catch (error) {
    console.error('Error creating dataset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create dataset'
    });
  }
};

// Update dataset
export const updateDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, timestamp, dataset_info, annotations, camera, lidar, metadata } = req.body;

    const dataset = await Dataset.findOne({ _id: id, deletedAt: null });

    if (!dataset) {
      res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
      return;
    }

    // Update fields
    if (name !== undefined) dataset.name = name.trim();
    if (description !== undefined) dataset.description = description?.trim();
    if (timestamp !== undefined) dataset.timestamp = timestamp;
    if (dataset_info !== undefined) dataset.dataset_info = dataset_info;
    if (annotations !== undefined) dataset.annotations = annotations;
    if (camera !== undefined) dataset.camera = camera;
    if (lidar !== undefined) dataset.lidar = lidar;
    if (metadata !== undefined) dataset.metadata = metadata;

    const updatedDataset = await dataset.save();

    res.json({
      success: true,
      message: 'Dataset updated successfully',
      data: updatedDataset
    });
  } catch (error) {
    console.error('Error updating dataset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update dataset'
    });
  }
};

// Delete dataset
export const deleteDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const dataset = await Dataset.findOne({ _id: id, deletedAt: null });

    if (!dataset) {
      res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
      return;
    }

    dataset.deletedAt = new Date();
    await dataset.save();

    res.json({
      success: true,
      message: 'Dataset deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete dataset'
    });
  }
};
