import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import EpochVisualization from '../models/EpochVisualization';
import Epoch from '../models/Epoch';
import { getSignedUrl, getUploadSignedUrl } from '../services/minioService';

/**
 * Get upload signed URL for visualization image
 */
export const getVisualizationUploadUrl = async (req: Request, res: Response) => {
  try {
    const { epoch_uuid, filename, type, mimetype } = req.body;

    if (!epoch_uuid || !filename || !type || !mimetype) {
      return res.status(400).json({
        success: false,
        message: 'epoch_uuid, filename, type, and mimetype are required'
      });
    }

    // Verify epoch exists
    const epoch = await Epoch.findOne({ epoch_uuid });
    if (!epoch) {
      return res.status(404).json({
        success: false,
        message: 'Epoch not found'
      });
    }

    // Generate unique IDs
    const visualization_uuid = uuidv4();
    const extension = filename.split('.').pop();
    const minioFileId = `visualizations/${epoch_uuid}/${type}/${visualization_uuid}.${extension}`;

    // Get upload URL from MinIO
    const uploadUrl = await getUploadSignedUrl(minioFileId, mimetype, 15);

    console.info('Visualization upload URL generated', {
      visualization_uuid,
      epoch_uuid,
      type,
      filename
    });

    res.status(200).json({
      success: true,
      data: {
        uploadUrl,
        visualization_uuid,
        minioFileId,
        epoch_uuid,
        expiresInMinutes: 15
      }
    });
  } catch (error: any) {
    console.error('Error generating visualization upload URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upload URL',
      error: error.message
    });
  }
};

/**
 * Create visualization record after successful upload
 */
export const createVisualization = async (req: Request, res: Response) => {
  try {
    const {
      epoch_uuid,
      visualization_uuid,
      filename,
      type,
      minioFileId,
      mimetype,
      size,
      metadata
    } = req.body;

    if (!epoch_uuid || !visualization_uuid || !filename || !type || !minioFileId || !mimetype || !size) {
      return res.status(400).json({
        success: false,
        message: 'epoch_uuid, visualization_uuid, filename, type, minioFileId, mimetype, and size are required'
      });
    }

    // Verify epoch exists
    const epoch = await Epoch.findOne({ epoch_uuid });
    if (!epoch) {
      return res.status(404).json({
        success: false,
        message: 'Epoch not found'
      });
    }

    // Check if visualization with this UUID already exists
    const existingVisualization = await EpochVisualization.findOne({ visualization_uuid });
    if (existingVisualization) {
      return res.status(409).json({
        success: false,
        message: 'Visualization with this UUID already exists'
      });
    }

    // Create visualization record
    const visualization = new EpochVisualization({
      epoch_uuid,
      visualization_uuid,
      filename,
      type,
      minioFileId,
      uploadedAt: new Date(),
      metadata: {
        ...metadata,
        mimetype,
        size
      }
    });

    await visualization.save();

    console.info('Visualization created successfully', {
      visualization_uuid,
      epoch_uuid,
      type,
      filename
    });

    res.status(201).json({
      success: true,
      message: 'Visualization created successfully',
      data: visualization
    });
  } catch (error: any) {
    console.error('Error creating visualization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create visualization',
      error: error.message
    });
  }
};

/**
 * Get visualizations for a specific epoch
 */
export const getVisualizationsByEpoch = async (req: Request, res: Response) => {
  try {
    const { epoch_uuid } = req.params;
    const { type } = req.query;

    const query: any = { epoch_uuid };
    if (type) {
      query.type = type;
    }

    const visualizations = await EpochVisualization.find(query).sort({ uploadedAt: -1 });

    // Generate signed URLs for each visualization
    const visualizationsWithUrls = await Promise.all(
      visualizations.map(async (viz) => {
        const signedUrlData = await getSignedUrl(viz.minioFileId, 60);
        return {
          ...viz.toObject(),
          signedUrl: signedUrlData?.signedUrl,
          urlExpiresAt: signedUrlData?.expiresAt
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        visualizations: visualizationsWithUrls,
        total: visualizations.length
      }
    });
  } catch (error: any) {
    console.error('Error fetching visualizations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch visualizations',
      error: error.message
    });
  }
};

/**
 * Get visualizations by training ID (across all epochs)
 * If training_uuid is empty, get all visualizations
 */
export const getVisualizationsByTraining = async (req: Request, res: Response) => {
  try {
    const { training_uuid } = req.params;
    const { type, limit = 50, page = 1 } = req.query;

    let epochUuids: string[] = [];
    let epochs: any[] = [];

    // If training_uuid is provided and not empty, filter by training
    if (training_uuid && training_uuid.trim() !== '') {
      // Find all epochs for this training
      epochs = await Epoch.find({ training_uuid }).select('epoch_uuid epoch');
      epochUuids = epochs.map(e => e.epoch_uuid);

      if (epochUuids.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            visualizations: [],
            total: 0,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: 0,
              pages: 0
            }
          }
        });
      }
    }

    // Build query
    const query: any = {};
    if (epochUuids.length > 0) {
      query.epoch_uuid = { $in: epochUuids };
    }
    if (type) {
      query.type = type;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await EpochVisualization.countDocuments(query);
    const visualizations = await EpochVisualization.find(query)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // If getting all visualizations, fetch all epochs at once for efficiency
    let allEpochs: any[] = [];
    if (epochUuids.length === 0 && visualizations.length > 0) {
      const uniqueEpochUuids = [...new Set(visualizations.map(v => v.epoch_uuid))];
      allEpochs = await Epoch.find({ epoch_uuid: { $in: uniqueEpochUuids } })
        .select('epoch_uuid epoch training_uuid');
    }

    // Generate signed URLs and add epoch info
    const visualizationsWithUrls = await Promise.all(
      visualizations.map(async (viz) => {
        // Find epoch info
        let epochNumber: number | undefined;
        let trainingUuid: string | undefined;
        
        if (epochs.length > 0) {
          const epoch = epochs.find(e => e.epoch_uuid === viz.epoch_uuid);
          epochNumber = epoch?.epoch;
          trainingUuid = epoch?.training_uuid;
        } else if (allEpochs.length > 0) {
          const epoch = allEpochs.find(e => e.epoch_uuid === viz.epoch_uuid);
          epochNumber = epoch?.epoch;
          trainingUuid = epoch?.training_uuid;
        }

        const signedUrlData = await getSignedUrl(viz.minioFileId, 60);
        return {
          ...viz.toObject(),
          epoch: epochNumber,
          training_uuid: trainingUuid,
          signedUrl: signedUrlData?.signedUrl,
          urlExpiresAt: signedUrlData?.expiresAt
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        visualizations: visualizationsWithUrls,
        total,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error: any) {
    console.error('Error fetching visualizations by training:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch visualizations',
      error: error.message
    });
  }
};

/**
 * Get visualization by UUID
 */
export const getVisualizationByUuid = async (req: Request, res: Response) => {
  try {
    const { visualization_uuid } = req.params;

    const visualization = await EpochVisualization.findOne({ visualization_uuid });

    if (!visualization) {
      return res.status(404).json({
        success: false,
        message: 'Visualization not found'
      });
    }

    // Generate signed URL
    const signedUrlData = await getSignedUrl(visualization.minioFileId, 60);

    res.status(200).json({
      success: true,
      data: {
        ...visualization.toObject(),
        signedUrl: signedUrlData?.signedUrl,
        urlExpiresAt: signedUrlData?.expiresAt
      }
    });
  } catch (error: any) {
    console.error('Error fetching visualization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch visualization',
      error: error.message
    });
  }
};

/**
 * Delete visualization
 */
export const deleteVisualization = async (req: Request, res: Response) => {
  try {
    const { visualization_uuid } = req.params;

    const visualization = await EpochVisualization.findOne({ visualization_uuid });

    if (!visualization) {
      return res.status(404).json({
        success: false,
        message: 'Visualization not found'
      });
    }

    // Note: We don't delete from MinIO to preserve the file
    // Only delete the database record
    await EpochVisualization.deleteOne({ visualization_uuid });

    console.info('Visualization deleted', { visualization_uuid });

    res.status(200).json({
      success: true,
      message: 'Visualization deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting visualization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete visualization',
      error: error.message
    });
  }
};

/**
 * Get visualization types (distinct types across all visualizations)
 */
export const getVisualizationTypes = async (req: Request, res: Response) => {
  try {
    const { training_uuid, epoch_uuid } = req.query;

    let query: any = {};
    
    if (epoch_uuid) {
      query.epoch_uuid = epoch_uuid;
    } else if (training_uuid) {
      // Find all epochs for this training
      const epochs = await Epoch.find({ training_uuid }).select('epoch_uuid');
      const epochUuids = epochs.map(e => e.epoch_uuid);
      query.epoch_uuid = { $in: epochUuids };
    }

    const types = await EpochVisualization.distinct('type', query);

    res.status(200).json({
      success: true,
      data: {
        types: types.sort()
      }
    });
  } catch (error: any) {
    console.error('Error fetching visualization types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch visualization types',
      error: error.message
    });
  }
};
