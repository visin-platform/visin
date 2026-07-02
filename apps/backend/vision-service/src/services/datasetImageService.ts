import mongoose from 'mongoose';
import DatasetImage from '../models/DatasetImage';
import Dataset from '../models/Dataset';
import ImageCategory from '../models/ImageCategory';
import { 
  getPhotoSignedUrlsBatch, 
  SignedUrlData, 
  deleteFile, 
  getPhotoSignedUrl, 
  generateFileId, 
  getUploadSignedUrl 
} from './minioService';

export interface ImageFilterOptions {
  datasetId?: string;
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  tags?: string[];
  weatherCondition?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  random?: boolean;
}

export interface CreateDatasetImageData {
  filename: string;
  originalName: string;
  minioFileId: string;
  datasetId: string;
  categoryId: string;
  title?: string;
  description?: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  tags?: string[];
  labels?: string[];
  weatherCondition?: string;
  metadata?: any;
}

export interface UpdateDatasetImageData {
  title?: string;
  description?: string;
  tags?: string[];
  labels?: string[];
  categoryId?: string | null;
  weatherCondition?: string;
  metadata?: any;
}

async function enrichImagesWithUrls(images: any[]) {
  let signedUrlMap: Record<string, SignedUrlData> = {};

  try {
    signedUrlMap = await getPhotoSignedUrlsBatch(images, false, 60);
  } catch (error) {
    console.error('Failed to fetch batch signed URLs for dataset images:', error);
  }

  const imagesWithThumbnails = images.filter((image) => image.minioThumbnailFileId);
  let thumbnailSignedUrlMap: Record<string, SignedUrlData> = {};

  if (imagesWithThumbnails.length > 0) {
    try {
      thumbnailSignedUrlMap = await getPhotoSignedUrlsBatch(imagesWithThumbnails, true, 60);
    } catch (error) {
      console.error('Failed to fetch batch signed URLs for thumbnails:', error);
    }
  }

  return images.map((image) => {
    const signedUrlData = signedUrlMap[image.minioFileId || ''];
    const imageObj = typeof image.toObject === 'function' ? image.toObject() : image;

    const result: any = { ...imageObj };

    if (signedUrlData) {
      result.signedUrl = signedUrlData.signedUrl;
      result.signedUrlExpiresAt = signedUrlData.expiresAt;
      result.signedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
    }

    if (image.minioThumbnailFileId) {
      const thumbnailSignedUrlData = thumbnailSignedUrlMap[image.minioFileId || ''];
      if (thumbnailSignedUrlData) {
        result.thumbnailSignedUrl = thumbnailSignedUrlData.signedUrl;
        result.thumbnailSignedUrlExpiresAt = thumbnailSignedUrlData.expiresAt;
        result.thumbnailSignedUrlExpiresInMinutes = thumbnailSignedUrlData.expiresInMinutes;
      }
    } else {
      if (signedUrlData) {
        result.thumbnailSignedUrl = signedUrlData.signedUrl;
        result.thumbnailSignedUrlExpiresAt = signedUrlData.expiresAt;
        result.thumbnailSignedUrlExpiresInMinutes = signedUrlData.expiresInMinutes;
      }
    }

    return result;
  });
}

export const getImages = async (options: ImageFilterOptions) => {
  const {
    datasetId,
    page = 1,
    limit = 50,
    search,
    categoryId,
    tags,
    weatherCondition,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
    random
  } = options;

  const query: any = {};
  
  if (datasetId) {
      query.datasetId = datasetId;
  }

  if (search) {
    query.$text = { $search: search };
  }
  
  if (categoryId) {
    query.categoryId = categoryId;
  }
  
  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }
  
  if (weatherCondition) {
    query.weatherCondition = weatherCondition;
  }

  const limitNum = Math.min(Number(limit), 1000000);
  const pageNum = Number(page);
  
  let images: any[];

  if (random && limitNum > 0) {
      const pipeline = [
      { $match: query },
      { $sample: { size: limitNum } }
    ];

    const rawImages = await DatasetImage.aggregate(pipeline);
    images = rawImages.map(doc => ({
      ...doc,
      toObject: () => doc,
      minioFileId: doc.minioFileId,
      minioThumbnailFileId: doc.minioThumbnailFileId
    }));
  } else {
      const sortOptions: any = {};
      const validSortFields = ['createdAt', 'updatedAt', 'filename'];
      
      if (validSortFields.includes(sortBy)) {
          sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
      } else {
          sortOptions.updatedAt = -1;
      }

      let imagesQuery = DatasetImage.find(query).sort(sortOptions);

      if (limitNum > 0) {
          imagesQuery = imagesQuery.limit(limitNum).skip((pageNum - 1) * limitNum);
      }
      
      images = await imagesQuery;
  }

  const total = await DatasetImage.countDocuments(query);

  if (images.length === 0) {
    return {
      images: [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: 0,
        pages: 0
      }
    };
  }

  const imagesWithUrls = await enrichImagesWithUrls(images);

  return {
    images: imagesWithUrls,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: limitNum > 0 ? Math.ceil(total / limitNum) : 1
    }
  };
};

export const createDatasetImage = async (data: CreateDatasetImageData) => {
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
  } = data;

  // Validate category exists
  const category = await ImageCategory.findById(categoryId);
  if (!category) {
    throw new Error('Invalid categoryId. Category does not exist.');
  }

  // Check if image with this minioFileId already exists
  const existingImage = await DatasetImage.findOne({ minioFileId });
  if (existingImage) {
    throw new Error('Image with this MinIO file ID already exists');
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
  return savedImage;
};

export const getImagesByCategory = async (datasetId: string, categoryId: string, options: { page?: number, limit?: number, search?: string, labels?: string }) => {
  const { page = 1, limit, search, labels } = options;

  // First, find the dataset by uuid, name, or ObjectId
  const dataset = await Dataset.findOne({
    $or: [
      { uuid: datasetId },
      { name: datasetId },
      { _id: mongoose.Types.ObjectId.isValid(datasetId) ? datasetId : null }
    ].filter(condition => condition !== null)
  });

  if (!dataset) {
    throw new Error(`Dataset '${datasetId}' not found`);
  }

  const query: any = { datasetId: dataset._id, categoryId };
  if (search) {
    query.$text = { $search: search };
  }
  if (labels) {
    const labelsArray = labels.split(',').map(label => label.trim());
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

  if (images.length === 0) {
    return {
      images: [],
      pagination: {
        page: pageNum,
        limit: limitNum || 0,
        total: 0,
        pages: 0
      }
    };
  }

  const imagesWithUrls = await enrichImagesWithUrls(images);

  return {
    images: imagesWithUrls,
    pagination: {
      page: pageNum,
      limit: limitNum || 0,
      total,
      pages: limitNum && limitNum > 0 ? Math.ceil(total / limitNum) : 1
    }
  };
};

export const getAllImageStats = async () => {
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

  return {
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
  };
};

export const getLabelingStats = async (datasetId?: string) => {
  let matchStage = {};
  if (datasetId) {
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

  return {
    total: result.total,
    good: result.good,
    bad: result.bad,
    unlabeled: result.unlabeled,
    goodPercentage,
    badPercentage,
    unlabeledPercentage,
    lastUpdated: new Date()
  };
};

export const getSimpleLabelingStats = async (datasetId: string) => {
  // Use Promise.all for parallel execution of count queries
  const [total, good, bad] = await Promise.all([
    DatasetImage.countDocuments({ datasetId }),
    DatasetImage.countDocuments({ datasetId, tags: { $in: ['good'] } }),
    DatasetImage.countDocuments({ datasetId, tags: { $in: ['bad'] } })
  ]);

  return {
    total,
    good,
    bad
  };
};

export const exportImagesByLabels = async (datasetId: string, labels: string) => {
  // First, find the dataset by uuid, name, or ObjectId
  const dataset = await Dataset.findOne({
    $or: [
      { uuid: datasetId },
      { name: datasetId },
      { _id: mongoose.Types.ObjectId.isValid(datasetId) ? datasetId : null }
    ].filter(condition => condition !== null)
  });

  if (!dataset) {
    throw new Error(`Dataset '${datasetId}' not found`);
  }

  const labelsArray = labels.split(',').map(label => label.trim());
  const query = { datasetId: dataset._id, labels: { $in: labelsArray } };

  const images = await DatasetImage.find(query).populate('categoryId').sort({ createdAt: -1 });
  return { images, labelsArray };
};

export const getImageById = async (id: string) => {
  const image = await DatasetImage.findById(id).populate('datasetId');

  if (!image) {
    throw new Error('Dataset image not found');
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

    return result;
  } catch (error) {
    console.error('Failed to get signed URL:', error);
    return image.toObject();
  }
};

export const updateImage = async (id: string, data: UpdateDatasetImageData) => {
  const { title, description, tags, labels, categoryId, weatherCondition, metadata } = data;

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
    throw new Error('Dataset image not found');
  }

  return image;
};

export const deleteImage = async (id: string) => {
  const image = await DatasetImage.findById(id);
  if (!image) {
    throw new Error('Dataset image not found');
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

  return {
    datasetId: image.datasetId,
    minioFileId: image.minioFileId,
    hadThumbnail: !!image.minioThumbnailFileId
  };
};

export const getUploadSignedUrlRequest = async (data: { filename: string, mimetype: string, datasetId: string, categoryId?: string, userId: string }) => {
  const { filename, mimetype, datasetId, categoryId, userId } = data;

  // Validate category exists if provided
  if (categoryId) {
    const category = await ImageCategory.findById(categoryId);
    if (!category) {
      throw new Error('Invalid categoryId. Category does not exist.');
    }
  }

  // Generate secure file ID
  const fileId = generateFileId(userId, datasetId, filename, 'vision'); // Using 'vision' as groupId
  
  // Get upload URL directly from MinIO
  const uploadUrl = await getUploadSignedUrl(fileId, mimetype, 15);

  return {
    uploadUrl,
    minioFileId: fileId,
    datasetId,
    categoryId,
    expiresInMinutes: 15
  };
};

export const exportImageNames = async (datasetId: string, tag?: string) => {
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
  return images;
};
