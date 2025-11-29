import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DatasetImage from '../models/DatasetImage';
import Dataset from '../models/Dataset';
import {
  deleteFile,
  getSignedUrl,
  getPhotoSignedUrl,
  getPhotoSignedUrlsBatch,
  getUploadSignedUrl,
  generateFileId,
  SignedUrlData
} from '../services/minioService';

// Get all images
export const getAllImages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, search, tags, random, weatherCondition } = req.query; // Default limit of 50

    const query: any = {};
    if (search) {
      query.$text = { $search: search as string };
    }
    if (tags) {
      const tagsArray = (tags as string).split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0);
      if (tagsArray.length > 0) {
        query.tags = { $in: tagsArray };
      }
    }
    if (weatherCondition) {
      query.weatherCondition = weatherCondition;
    }

    const limitNum = Math.min(Number(limit), 1000000); // Cap at 1M for large datasets
    const pageNum = Number(page);

    let images: any[];

    if (random === 'true' && limitNum > 0) {
      // Use MongoDB $sample for randomization - returns raw documents
      const pipeline = [
        { $match: query },
        { $sample: { size: limitNum } }
      ];

      const rawImages = await DatasetImage.aggregate(pipeline);
      // Convert raw aggregation results to have the same structure as Mongoose documents
      images = rawImages.map(doc => ({
        ...doc,
        toObject: () => doc,
        minioFileId: doc.minioFileId,
        minioThumbnailFileId: doc.minioThumbnailFileId
      }));
    } else {
      // Standard pagination with sorting
      let imagesQuery = DatasetImage.find(query).sort({ createdAt: -1 });

      if (limitNum && limitNum > 0) {
        imagesQuery = imagesQuery.limit(limitNum).skip((pageNum - 1) * limitNum);
      }

      images = await imagesQuery;
    }

    const total = await DatasetImage.countDocuments(query);

    // If no images found, return empty array
    if (images.length === 0) {
      res.json({
        success: true,
        data: {
          images: [],
          pagination: {
            page: pageNum,
            limit: limitNum || 0,
            total: 0,
            pages: 0
          }
        }
      });
      return;
    }

    const fileIds = images.map((image) => image.minioFileId).filter(Boolean);
    let signedUrlMap: Record<string, SignedUrlData> = {};

    try {
      signedUrlMap = await getPhotoSignedUrlsBatch(images, false, 60);
    } catch (error) {
      console.error('Failed to fetch batch signed URLs for dataset images:', error);
      // Continue without signed URLs
    }

    // Get thumbnail URLs for images that have thumbnails
    const imagesWithThumbnails = images.filter((image) => image.minioThumbnailFileId);
    let thumbnailSignedUrlMap: Record<string, SignedUrlData> = {};

    if (imagesWithThumbnails.length > 0) {
      try {
        thumbnailSignedUrlMap = await getPhotoSignedUrlsBatch(imagesWithThumbnails, true, 60);
      } catch (error) {
        console.error('Failed to fetch batch signed URLs for thumbnails:', error);
        // Continue without thumbnail URLs
      }
    }

    const imagesWithUrls = images.map((image) => {
      const signedUrlData = signedUrlMap[image.minioFileId || ''];
      const imageObj = image.toObject();

      const result: any = { ...imageObj };

      if (signedUrlData) {
        result.signedUrl = signedUrlData.signedUrl;
        result.signedUrlExpiresAt = signedUrlData.expiresAt;
        result.signedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
      }

      // For images with minioThumbnailFileId, try to get thumbnail signed URL
      if (image.minioThumbnailFileId) {
        const thumbnailSignedUrlData = thumbnailSignedUrlMap[image.minioFileId || ''];
        if (thumbnailSignedUrlData) {
          result.thumbnailSignedUrl = thumbnailSignedUrlData.signedUrl;
          result.thumbnailSignedUrlExpiresAt = thumbnailSignedUrlData.expiresAt;
          result.thumbnailSignedUrlExpiresInMinutes = thumbnailSignedUrlData.expiresInMinutes;
        }
      } else {
        // For images without thumbnails, use original as thumbnail
        if (signedUrlData) {
          result.thumbnailSignedUrl = signedUrlData.signedUrl;
          result.thumbnailSignedUrlExpiresAt = signedUrlData.expiresAt;
          result.thumbnailSignedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
        }
      }

      return result;
    });

    res.json({
      success: true,
      data: {
        images: imagesWithUrls,
        pagination: {
          page: pageNum,
          limit: limitNum || 0,
          total,
          pages: limitNum && limitNum > 0 ? Math.ceil(total / limitNum) : 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch images'
    });
  }
};

export const createDatasetImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      filename,
      originalName,
      minioFileId,
      datasetId,
      categoryId,
      title,
      description,
      mimetype,
      size,
      width,
      height,
      tags = [],
      labels = [],
      weatherCondition,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!filename || !originalName || !minioFileId || !datasetId || !categoryId || !mimetype || !size) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: filename, originalName, minioFileId, datasetId, categoryId, mimetype, size'
      });
      return;
    }

    // Validate category exists
    const ImageCategory = require('../models/ImageCategory').default;
    const category = await ImageCategory.findById(categoryId);
    if (!category) {
      res.status(400).json({
        success: false,
        message: 'Invalid categoryId. Category does not exist.'
      });
      return;
    }

    // Note: We don't validate dataset existence here since datasetId can be any string identifier
    // (e.g., dataset name like "zod", "waymo", etc.)

    // Check if image with this minioFileId already exists
    const existingImage = await DatasetImage.findOne({ minioFileId });
    if (existingImage) {
      res.status(409).json({
        success: false,
        message: 'Image with this MinIO file ID already exists'
      });
      return;
    }

    const image = new DatasetImage({
      filename,
      originalName,
      minioFileId,
      datasetId,
      categoryId,
      title: title?.trim(),
      description: description?.trim(),
      mimetype,
      size,
      width,
      height,
      tags: tags.map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0),
      labels: labels.map((label: string) => label.trim()).filter((label: string) => label.length > 0),
      weatherCondition,
      metadata
    });

    const savedImage = await image.save();

    console.info(`Dataset image created: ${savedImage._id}`, {
      datasetId,
      categoryId,
      minioFileId
    });

    res.status(201).json({
      success: true,
      message: 'Dataset image created successfully',
      data: savedImage
    });
  } catch (error) {
    console.error('Error creating dataset image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create dataset image'
    });
  }
};

// Get images by dataset (simplified - doesn't require dataset to exist)
export const getImagesByDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;
    const { page = 1, limit, search, categoryId, tags, weatherCondition, sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;

    const query: any = { datasetId };

    if (search) {
      query.$text = { $search: search as string };
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }
    if (tags) {
      const tagsArray = (tags as string).split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0);
      if (tagsArray.length > 0) {
        query.tags = { $in: tagsArray };
      }
    }
    if (weatherCondition) {
      query.weatherCondition = weatherCondition;
    }

    const limitNum = limit ? Number(limit) : undefined;
    const pageNum = Number(page);

    // Build sort object
    const sortOptions: any = {};
    const validSortFields = ['createdAt', 'updatedAt', 'filename'];
    const validSortOrders = ['asc', 'desc'];

    if (validSortFields.includes(sortBy as string)) {
      sortOptions[sortBy as string] = (sortOrder as string) === 'asc' ? 1 : -1;
    } else {
      // Default to updatedAt desc if invalid sortBy provided
      sortOptions.updatedAt = -1;
    }

    let imagesQuery = DatasetImage.find(query).sort(sortOptions);

    if (limitNum && limitNum > 0) {
      imagesQuery = imagesQuery.limit(limitNum).skip((pageNum - 1) * limitNum);
    }

    const images = await imagesQuery;
    const total = await DatasetImage.countDocuments(query);

    // If no images found, return empty array
    if (images.length === 0) {
      res.json({
        success: true,
        data: {
          images: [],
          pagination: {
            page: pageNum,
            limit: limitNum || 0,
            total: 0,
            pages: 0
          }
        }
      });
      return;
    }

    const fileIds = images.map((image) => image.minioFileId).filter(Boolean);
    let signedUrlMap: Record<string, SignedUrlData> = {};

    try {
      signedUrlMap = await getPhotoSignedUrlsBatch(images, false, 60);
    } catch (error) {
      console.error('Failed to fetch batch signed URLs for dataset images:', error);
      // Continue without signed URLs
    }

    // Get thumbnail URLs for images that have thumbnails
    const imagesWithThumbnails = images.filter((image) => image.minioThumbnailFileId);
    let thumbnailSignedUrlMap: Record<string, SignedUrlData> = {};

    if (imagesWithThumbnails.length > 0) {
      try {
        thumbnailSignedUrlMap = await getPhotoSignedUrlsBatch(imagesWithThumbnails, true, 60);
      } catch (error) {
        console.error('Failed to fetch batch signed URLs for thumbnails:', error);
        // Continue without thumbnail URLs
      }
    }

    const imagesWithUrls = images.map((image) => {
      const signedUrlData = signedUrlMap[image.minioFileId || ''];
      const imageObj = image.toObject();

      const result: any = { ...imageObj };

      if (signedUrlData) {
        result.signedUrl = signedUrlData.signedUrl;
        result.signedUrlExpiresAt = signedUrlData.expiresAt;
        result.signedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
      }

      // For images with minioThumbnailFileId, try to get thumbnail signed URL
      if (image.minioThumbnailFileId) {
        const thumbnailSignedUrlData = thumbnailSignedUrlMap[image.minioFileId || ''];
        if (thumbnailSignedUrlData) {
          result.thumbnailSignedUrl = thumbnailSignedUrlData.signedUrl;
          result.thumbnailSignedUrlExpiresAt = thumbnailSignedUrlData.expiresAt;
          result.thumbnailSignedUrlExpiresInMinutes = thumbnailSignedUrlData.expiresInMinutes;
        }
      } else {
        // For images without thumbnails, use original as thumbnail
        if (signedUrlData) {
          result.thumbnailSignedUrl = signedUrlData.signedUrl;
          result.thumbnailSignedUrlExpiresAt = signedUrlData.expiresAt;
          result.thumbnailSignedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
        }
      }

      return result;
    });

    res.json({
      success: true,
      data: {
        images: imagesWithUrls,
        pagination: {
          page: pageNum,
          limit: limitNum || 0,
          total,
          pages: limitNum && limitNum > 0 ? Math.ceil(total / limitNum) : 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dataset images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dataset images'
    });
  }
};

// Get images by dataset and category
export const getImagesByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId, categoryId } = req.params;
    const { page = 1, limit, search, labels } = req.query;

    // First, find the dataset by uuid, name, or ObjectId
    const dataset = await Dataset.findOne({
      $or: [
        { uuid: datasetId },
        { name: datasetId },
        { _id: mongoose.Types.ObjectId.isValid(datasetId) ? datasetId : null }
      ].filter(condition => condition !== null)
    });

    if (!dataset) {
      res.status(404).json({
        success: false,
        message: `Dataset '${datasetId}' not found`
      });
      return;
    }

    const query: any = { datasetId: dataset._id, categoryId };
    if (search) {
      query.$text = { $search: search as string };
    }
    if (labels) {
      const labelsArray = (labels as string).split(',').map(label => label.trim());
      query.labels = { $in: labelsArray };
    }

    const limitNum = limit ? Number(limit) : undefined;
    const pageNum = Number(page);

    let imagesQuery = DatasetImage.find(query).sort({ createdAt: -1 });

    if (limitNum && limitNum > 0) {
      imagesQuery = imagesQuery.limit(limitNum).skip((pageNum - 1) * limitNum);
    }

    const images = await imagesQuery;
    const total = await DatasetImage.countDocuments(query);

    // If no images found, return empty array
    if (images.length === 0) {
      res.json({
        success: true,
        data: {
          images: [],
          pagination: {
            page: pageNum,
            limit: limitNum || 0,
            total: 0,
            pages: 0
          }
        }
      });
      return;
    }

    const fileIds = images.map((image) => image.minioFileId).filter(Boolean);
    let signedUrlMap: Record<string, SignedUrlData> = {};

    try {
      signedUrlMap = await getPhotoSignedUrlsBatch(images, false, 60);
    } catch (error) {
      console.error('Failed to fetch batch signed URLs for dataset images:', error);
      // Continue without signed URLs
    }

    // Get thumbnail URLs for images that have thumbnails
    const imagesWithThumbnails = images.filter((image) => image.minioThumbnailFileId);
    let thumbnailSignedUrlMap: Record<string, SignedUrlData> = {};

    if (imagesWithThumbnails.length > 0) {
      try {
        thumbnailSignedUrlMap = await getPhotoSignedUrlsBatch(imagesWithThumbnails, true, 60);
      } catch (error) {
        console.error('Failed to fetch batch signed URLs for thumbnails:', error);
        // Continue without thumbnail URLs
      }
    }

    const imagesWithUrls = images.map((image) => {
      const signedUrlData = signedUrlMap[image.minioFileId || ''];
      const imageObj = image.toObject();

      const result: any = { ...imageObj };

      if (signedUrlData) {
        result.signedUrl = signedUrlData.signedUrl;
        result.signedUrlExpiresAt = signedUrlData.expiresAt;
        result.signedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
      }

      // For images with minioThumbnailFileId, try to get thumbnail signed URL
      if (image.minioThumbnailFileId) {
        const thumbnailSignedUrlData = thumbnailSignedUrlMap[image.minioFileId || ''];
        if (thumbnailSignedUrlData) {
          result.thumbnailSignedUrl = thumbnailSignedUrlData.signedUrl;
          result.thumbnailSignedUrlExpiresAt = thumbnailSignedUrlData.expiresAt;
          result.thumbnailSignedUrlExpiresInMinutes = thumbnailSignedUrlData.expiresInMinutes;
        }
      } else {
        // For images without thumbnails, use original as thumbnail
        if (signedUrlData) {
          result.thumbnailSignedUrl = signedUrlData.signedUrl;
          result.thumbnailSignedUrlExpiresAt = signedUrlData.expiresAt;
          result.thumbnailSignedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
        }
      }

      return result;
    });

    res.json({
      success: true,
      data: {
        images: imagesWithUrls,
        pagination: {
          page: pageNum,
          limit: limitNum || 0,
          total,
          pages: limitNum && limitNum > 0 ? Math.ceil(total / limitNum) : 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dataset images by category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dataset images by category'
    });
  }
};

// Get comprehensive image statistics across all datasets
export const getAllImageStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Basic counts
    const totalImages = await DatasetImage.countDocuments();
    const totalSize = await DatasetImage.aggregate([
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]);

    // Dataset breakdown
    const datasetStats = await DatasetImage.aggregate([
      {
        $group: {
          _id: '$datasetId',
          count: { $sum: 1 },
          totalSize: { $sum: '$size' },
          good: {
            $sum: {
              $cond: [{ $in: ['good', { $ifNull: ['$tags', []] }] }, 1, 0]
            }
          },
          bad: {
            $sum: {
              $cond: [{ $in: ['bad', { $ifNull: ['$tags', []] }] }, 1, 0]
            }
          },
          unlabeled: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$tags', null] }, { $eq: [{ $size: { $ifNull: ['$tags', []] } }, 0] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Tag distribution
    const tagStats = await DatasetImage.aggregate([
      { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Category breakdown
    const categoryStats = await DatasetImage.aggregate([
      {
        $group: {
          _id: '$categoryId',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'imagecategories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          count: 1,
          name: { $ifNull: ['$category.name', 'Unknown'] }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // File type distribution
    const fileTypeStats = await DatasetImage.aggregate([
      {
        $group: {
          _id: '$mimetype',
          count: { $sum: 1 },
          totalSize: { $sum: '$size' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalImages,
          totalSize: totalSize[0]?.total || 0,
          averageSize: totalImages > 0 ? Math.round((totalSize[0]?.total || 0) / totalImages) : 0
        },
        datasets: datasetStats,
        tags: tagStats,
        categories: categoryStats,
        fileTypes: fileTypeStats,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching comprehensive image statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comprehensive image statistics'
    });
  }
};

// Get labeling statistics (comprehensive for all datasets or specific dataset)
export const getLabelingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;

    let matchStage = {};
    if (datasetId) {
      // Note: We don't validate dataset existence here since datasetId can be any string identifier
      // (e.g., dataset name like "zod", "waymo", etc.) similar to getImagesByDataset
      matchStage = { datasetId };
    }

    // Get comprehensive labeling statistics
    const stats = await DatasetImage.aggregate([
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          good: {
            $sum: {
              $cond: [{ $in: ['good', { $ifNull: ['$tags', []] }] }, 1, 0]
            }
          },
          bad: {
            $sum: {
              $cond: [{ $in: ['bad', { $ifNull: ['$tags', []] }] }, 1, 0]
            }
          },
          unlabeled: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$tags', null] }, { $eq: [{ $size: { $ifNull: ['$tags', []] } }, 0] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const result = stats[0] || { total: 0, good: 0, bad: 0, unlabeled: 0 };

    // Calculate percentages
    const total = result.total;
    const goodPercentage = total > 0 ? Math.round((result.good / total) * 100) : 0;
    const badPercentage = total > 0 ? Math.round((result.bad / total) * 100) : 0;
    const unlabeledPercentage = total > 0 ? Math.round((result.unlabeled / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        total: result.total,
        good: result.good,
        bad: result.bad,
        unlabeled: result.unlabeled,
        goodPercentage,
        badPercentage,
        unlabeledPercentage,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching labeling statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch labeling statistics'
    });
  }
};

// Get simple labeling statistics for a specific dataset (total, good, bad counts only)
export const getSimpleLabelingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;

    // Note: We don't validate dataset existence here since datasetId can be any string identifier
    // (e.g., dataset name like "zod", "waymo", etc.) similar to getImagesByDataset

    // Use Promise.all for parallel execution of count queries
    const [total, good, bad] = await Promise.all([
      DatasetImage.countDocuments({ datasetId }),
      DatasetImage.countDocuments({ datasetId, tags: { $in: ['good'] } }),
      DatasetImage.countDocuments({ datasetId, tags: { $in: ['bad'] } })
    ]);

    res.json({
      success: true,
      data: {
        total,
        good,
        bad
      }
    });
  } catch (error) {
    console.error('Error fetching simple labeling statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch simple labeling statistics'
    });
  }
};

// Export images by labels to CSV
export const exportImagesByLabels = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;
    const { labels } = req.query;

    if (!labels) {
      res.status(400).json({
        success: false,
        message: 'Labels parameter is required'
      });
      return;
    }

    // First, find the dataset by uuid, name, or ObjectId
    const dataset = await Dataset.findOne({
      $or: [
        { uuid: datasetId },
        { name: datasetId },
        { _id: mongoose.Types.ObjectId.isValid(datasetId) ? datasetId : null }
      ].filter(condition => condition !== null)
    });

    if (!dataset) {
      res.status(404).json({
        success: false,
        message: `Dataset '${datasetId}' not found`
      });
      return;
    }

    const labelsArray = (labels as string).split(',').map(label => label.trim());
    const query = { datasetId: dataset._id, labels: { $in: labelsArray } };

    const images = await DatasetImage.find(query).populate('categoryId').sort({ createdAt: -1 });

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="images_${labelsArray.join('_')}_${Date.now()}.csv"`);

    // CSV header
    let csv = 'ID,Filename,Original Name,Category Name,Labels,Tags,Size,Width,Height,Created At\n';

    // Add data rows
    images.forEach((image) => {
      const labelsStr = image.labels.join(';');
      const tagsStr = image.tags.join(';');
      const categoryName = (image as any).categoryId?.name || 'Unknown';
      csv += `"${image._id}","${image.filename}","${image.originalName}","${categoryName}","${labelsStr}","${tagsStr}",${image.size},${image.width || ''},${image.height || ''},"${image.createdAt}"\n`;
    });

    res.send(csv);
  } catch (error) {
    console.error('Error exporting images to CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export images to CSV'
    });
  }
};
export const getImageById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const image = await DatasetImage.findById(id).populate('datasetId');

    if (!image) {
      res.status(404).json({
        success: false,
        message: 'Dataset image not found'
      });
      return;
    }

    try {
      const signedUrlData = await getPhotoSignedUrl(image, false, 60);
      const result: any = {
        ...image.toObject()
      };

      if (signedUrlData) {
        result.signedUrl = signedUrlData.signedUrl;
        result.signedUrlExpiresAt = signedUrlData.expiresAt;
        result.signedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
      }

      // Add thumbnail URL if available
      if (image.minioThumbnailFileId) {
        try {
          const thumbnailSignedUrlData = await getPhotoSignedUrl(image, true, 60);
          if (thumbnailSignedUrlData) {
            result.thumbnailSignedUrl = thumbnailSignedUrlData.signedUrl;
            result.thumbnailSignedUrlExpiresAt = thumbnailSignedUrlData.expiresAt;
            result.thumbnailSignedUrlExpiresInMinutes = thumbnailSignedUrlData.expiresInMinutes;
          }
        } catch (error) {
          console.error('Failed to get thumbnail signed URL:', error);
        }
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Failed to get signed URL:', error);
      res.json({
        success: true,
        data: image.toObject()
      });
    }
  } catch (error) {
    console.error('Error fetching dataset image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dataset image'
    });
  }
};

// Update image
export const updateImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, tags, labels, categoryId, weatherCondition, metadata } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title?.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (tags) updateData.tags = tags.map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
    if (labels) updateData.labels = labels.map((label: string) => label.trim()).filter((label: string) => label.length > 0);
    if (categoryId !== undefined) updateData.categoryId = categoryId || null; // Allow null to remove category
    if (weatherCondition !== undefined) updateData.weatherCondition = weatherCondition;
    if (metadata) updateData.metadata = metadata;

    const image = await DatasetImage.findByIdAndUpdate(id, updateData, { new: true });

    if (!image) {
      res.status(404).json({
        success: false,
        message: 'Dataset image not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Dataset image updated successfully',
      data: image
    });
  } catch (error) {
    console.error('Error updating dataset image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update dataset image'
    });
  }
};

// Delete image
export const deleteImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const image = await DatasetImage.findById(id);
    if (!image) {
      res.status(404).json({
        success: false,
        message: 'Dataset image not found'
      });
      return;
    }

    // Delete files from MinIO (both original and thumbnail if exists)
    try {
      // Delete original file
      await deleteFile(image.minioFileId);
      console.info(`Deleted original file from MinIO: ${image.minioFileId}`);

      // Delete thumbnail file if it exists
      if (image.minioThumbnailFileId) {
        await deleteFile(image.minioThumbnailFileId);
        console.info(`Deleted thumbnail file from MinIO: ${image.minioThumbnailFileId}`);
      }
    } catch (error) {
      console.error(`Failed to delete files for dataset image ${image.minioFileId}:`, error);
      // Continue with database deletion even if MinIO deletion fails
    }

    // Delete the image record from database
    await DatasetImage.findByIdAndDelete(id);

    console.info(`Dataset image deleted: ${id}`, {
      datasetId: image.datasetId,
      minioFileId: image.minioFileId,
      hadThumbnail: !!image.minioThumbnailFileId
    });

    res.json({
      success: true,
      message: 'Dataset image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting dataset image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete dataset image'
    });
  }
};

// Get upload signed URL for direct client upload
export const getUploadSignedUrlRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, mimetype, datasetId, categoryId } = req.body;
    const userId = (req as any).user?.id || 'anonymous'; // Default to 'anonymous' if no user

    console.info('Getting upload signed URL', { filename, mimetype, datasetId, categoryId, userId });

    if (!filename || !mimetype || !datasetId) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: filename, mimetype, datasetId'
      });
      return;
    }

    // Validate category exists if provided
    if (categoryId) {
      const ImageCategory = require('../models/ImageCategory').default;
      const category = await ImageCategory.findById(categoryId);
      if (!category) {
        res.status(400).json({
          success: false,
          message: 'Invalid categoryId. Category does not exist.'
        });
        return;
      }
    }

    // Note: We don't validate dataset existence here since datasetId can be any string identifier
    // (e.g., dataset name like "zod", "waymo", etc.)

    // Generate secure file ID
    const fileId = generateFileId(userId, datasetId, filename, 'vision'); // Using 'vision' as groupId
    console.info('Generated file ID', { fileId });

    // Get upload URL directly from MinIO
    const uploadUrl = await getUploadSignedUrl(fileId, mimetype, 15);
    console.info('Generated upload URL successfully');

    res.json({
      success: true,
      data: {
        uploadUrl,
        minioFileId: fileId,
        datasetId,
        categoryId,
        expiresInMinutes: 15
      }
    });
  } catch (error) {
    console.error('Error getting upload signed URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get upload signed URL'
    });
  }
};

// Export image names as CSV
export const exportImageNames = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;
    const { tag } = req.query;

    if (!datasetId) {
      res.status(400).json({
        success: false,
        message: 'Dataset ID is required'
      });
      return;
    }

    // Build query
    const query: any = { datasetId };

    // Filter by tag if specified
    if (tag && tag !== 'all') {
      if (tag === 'good') {
        query.tags = { $regex: /good/i };
      } else if (tag === 'bad') {
        query.tags = { $regex: /bad/i };
      }
    }

    // Get all matching images
    const images = await DatasetImage.find(query).sort({ createdAt: -1 });

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="images_${tag || 'all'}_${new Date().toISOString().split('T')[0]}.csv"`);

    // Generate CSV content - just image names, one per line
    let csv = '';
    images.forEach((image) => {
      const imageName = image.title || image.originalName || image.filename;
      csv += `${imageName}\n`;
    });

    res.send(csv);
  } catch (error) {
    console.error('Error exporting image names:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export image names'
    });
  }
};