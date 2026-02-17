import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Dataset from '../models/Dataset';
import { getLabelingStats as getLabelingStatsService } from '../services/datasetImageService';
import { getSignedUrl as getMinioSignedUrl } from '../services/minioService';

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
    const { name, description, timestamp, dataset_info, annotations, camera, lidar, metadata, downloadUrl } = req.body;

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
      metadata,
      downloadUrl
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

// Get labeling statistics for all images
export const getLabelingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getLabelingStatsService();

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching labeling stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch labeling statistics'
    });
  }
};

// Download dataset zip file
export const downloadDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;

    if (!uuid) {
      res.status(400).json({
        success: false,
        message: 'Dataset UUID is required'
      });
      return;
    }

    // Find the dataset by UUID
    const dataset = await Dataset.findOne({ uuid, deletedAt: null });

    if (!dataset) {
      res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
      return;
    }

    let downloadUrl: string;

    // Use the downloadUrl field if it exists, otherwise generate default path
    if (dataset.downloadUrl) {
      // If it's a MinIO path, generate signed URL
      if (dataset.downloadUrl.startsWith('datasets/') || dataset.downloadUrl.startsWith('vision/')) {
        const signedUrlData = await getMinioSignedUrl(dataset.downloadUrl, 60);
        if (signedUrlData) {
          downloadUrl = signedUrlData.signedUrl;
        } else {
          res.status(404).json({
            success: false,
            message: 'Could not generate signed URL for the dataset'
          });
          return;
        }
      } else {
        // If it's already a full URL, use it directly
        downloadUrl = dataset.downloadUrl;
      }
    } else {
      // Fallback to default path
      const minioKey = `datasets/${dataset.name}.zip`;
      const signedUrlData = await getMinioSignedUrl(minioKey, 60);
      if (signedUrlData) {
        downloadUrl = signedUrlData.signedUrl;
      } else {
        res.status(404).json({
          success: false,
          message: 'Could not generate signed URL for the dataset'
        });
        return;
      }
    }

    res.json({
      success: true,
      data: {
        downloadUrl,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      }
    });
  } catch (error) {
    console.error('Error generating dataset download URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate download URL'
    });
  }
};

// Get signed URL for arbitrary MinIO path
export const getSignedUrlForPath = async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    console.log('getSignedUrlForPath called with path:', path);

    if (!path || typeof path !== 'string') {
      res.status(400).json({
        success: false,
        message: 'MinIO path is required'
      });
      return;
    }

    // Generate signed URL with 1 hour expiration
    const signedUrlData = await getMinioSignedUrl(path, 60);

    console.log('signedUrlData result:', signedUrlData);

    if (!signedUrlData) {
      res.status(404).json({
        success: false,
        message: 'Could not generate signed URL for the specified path'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        signedUrl: signedUrlData.signedUrl,
        expiresAt: signedUrlData.expiresAt
      }
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate signed URL'
    });
  }
};
