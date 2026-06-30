import { Request, Response } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import EpochVisualization from '../models/EpochVisualization';
import Epoch from '../models/Epoch';
import Training from '../models/Training';
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
 * Get visualization by UUID
 */
export const getVisualizationByUuid = async (req: Request, res: Response) => {
  try {
    const visualization_uuid = req.params.visualization_uuid as string;

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
    const visualization_uuid = req.params.visualization_uuid as string;

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
 * Get visualizations by epoch UUID
 */
export const getVisualizationsByEpoch = async (req: Request, res: Response) => {
  try {
    const epoch_uuid = req.params.epoch_uuid as string;
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
 * Get visualizations by training UUID
 */
export const getVisualizationsByTraining = async (req: Request, res: Response) => {
  try {
    const training_uuid = req.params.training_uuid as string;
    const { type, limit = 50, page = 1, projectId, includeUrls = 'true' } = req.query;
    // If specific training_uuid is provided, return flat list for that training
    if (training_uuid && training_uuid.trim() !== '') {
      // Find all epochs for this training
      const epochs = await Epoch.find({ training_uuid }).select('epoch_uuid epoch');
      const epochUuids = epochs.map(e => e.epoch_uuid);

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

      // Build query
      const query: any = { epoch_uuid: { $in: epochUuids } };
      if (type) {
        query.type = type;
      }

      const skip = (Number(page) - 1) * Number(limit);
      const total = await EpochVisualization.countDocuments(query);
      const visualizations = await EpochVisualization.find(query)
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      // Generate signed URLs and add epoch info
      const shouldIncludeUrls = includeUrls === 'true';
      const visualizationsWithUrls = await Promise.all(
        visualizations.map(async (viz) => {
          const epoch = epochs.find(e => e.epoch_uuid === viz.epoch_uuid);
          const result: any = {
            ...viz.toObject(),
            epoch: epoch?.epoch
          };

          if (shouldIncludeUrls) {
            const signedUrlData = await getSignedUrl(viz.minioFileId, 60);
            result.signedUrl = signedUrlData?.signedUrl;
            result.urlExpiresAt = signedUrlData?.expiresAt;
          }

          return result;
        })
      );

      return res.status(200).json({
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
    }

    // If no training_uuid but projectId provided, group by training
    if (projectId) {
      // Find all trainings for this project
      const trainings = await Training.find({ projectId: projectId as string, deletedAt: null })
        .select('uuid name')
        .sort({ createdAt: -1 });

      if (trainings.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            trainings: [],
            total: 0
          }
        });
      }

      const trainingsData = await Promise.all(
        trainings.map(async (training) => {
          // Find all epochs for this training
          const epochs = await Epoch.find({ training_uuid: training.uuid }).select('epoch_uuid epoch');
          const epochUuids = epochs.map(e => e.epoch_uuid);

          if (epochUuids.length === 0) {
            return {
              training_uuid: training.uuid,
              training_name: training.name,
              visualizations: []
            };
          }

          // Build query for visualizations
          const query: any = { epoch_uuid: { $in: epochUuids } };
          if (type) {
            query.type = type;
          }

          const visualizations = await EpochVisualization.find(query)
            .sort({ uploadedAt: -1 });

          // Generate signed URLs and add epoch info
          const shouldIncludeUrls = includeUrls === 'true';
          const visualizationsWithUrls = await Promise.all(
            visualizations.map(async (viz) => {
              const epoch = epochs.find(e => e.epoch_uuid === viz.epoch_uuid);
              const result: any = {
                ...viz.toObject(),
                epoch: epoch?.epoch
              };

              if (shouldIncludeUrls) {
                const signedUrlData = await getSignedUrl(viz.minioFileId, 60);
                result.signedUrl = signedUrlData?.signedUrl;
                result.urlExpiresAt = signedUrlData?.expiresAt;
              }

              return result;
            })
          );

          return {
            training_uuid: training.uuid,
            training_name: training.name,
            visualizations: visualizationsWithUrls
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: {
          trainings: trainingsData,
          total: trainingsData.reduce((sum, t) => sum + t.visualizations.length, 0)
        }
      });
    }

    // Fallback: get all visualizations without grouping (shouldn't happen with current frontend)
    const query: any = {};
    if (type) {
      query.type = type;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await EpochVisualization.countDocuments(query);
    const visualizations = await EpochVisualization.find(query)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Fetch epochs for all visualizations
    const uniqueEpochUuids = [...new Set(visualizations.map(v => v.epoch_uuid))];
    const allEpochs = await Epoch.find({ epoch_uuid: { $in: uniqueEpochUuids } })
      .select('epoch_uuid epoch training_uuid');

    // Generate signed URLs and add epoch info
    const shouldIncludeUrls = includeUrls === 'true';
    const visualizationsWithUrls = await Promise.all(
      visualizations.map(async (viz) => {
        const epoch = allEpochs.find(e => e.epoch_uuid === viz.epoch_uuid);
        const result: any = {
          ...viz.toObject(),
          epoch: epoch?.epoch,
          training_uuid: epoch?.training_uuid
        };

        if (shouldIncludeUrls) {
          const signedUrlData = await getSignedUrl(viz.minioFileId, 60);
          result.signedUrl = signedUrlData?.signedUrl;
          result.urlExpiresAt = signedUrlData?.expiresAt;
        }

        return result;
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
 * Get visualization types (distinct types across all visualizations)
 */
export const getVisualizationTypes = async (req: Request, res: Response) => {
  try {
    const training_uuid = req.query.training_uuid as string;
    const epoch_uuid = req.query.epoch_uuid as string;

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
