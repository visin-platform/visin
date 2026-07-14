import { QueryFilter } from 'mongoose';
import { NotFoundError, logger } from '@visin/backend-core';
import DatasetAnalysis, { IDatasetAnalysis } from '../models/DatasetAnalysis';

interface UploadAnalysisData {
  dataset: string;
  size?: string;
  data?: Record<string, unknown>;
  downloadUrl?: string;
}

interface GetAnalysesOptions {
  dataset?: string;
  limit: number;
  skip: number;
}

interface UpdateAnalysisData {
  dataset?: string;
  size?: string;
  data?: Record<string, unknown>;
}

const withDownloadUrl = (analysis: IDatasetAnalysis) => ({
  ...analysis.toObject(),
  downloadUrl: analysis.data?.downloadUrl
});

export const uploadAnalysis = async (analysisData: UploadAnalysisData) => {
  const analysis = new DatasetAnalysis({
    dataset: analysisData.dataset,
    size: analysisData.size,
    data: {
      ...analysisData.data,
      downloadUrl: analysisData.downloadUrl
    }
  });

  await analysis.save();

  logger.info('Dataset analysis uploaded', { dataset: analysisData.dataset, id: analysis._id });

  return analysis;
};

export const getAllAnalyses = async ({ dataset, limit, skip }: GetAnalysesOptions) => {
  const query: QueryFilter<IDatasetAnalysis> = {};
  if (dataset) {
    query.dataset = dataset;
  }

  const total = await DatasetAnalysis.countDocuments(query);
  const analyses = await DatasetAnalysis.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);

  return {
    analyses: analyses.map(withDownloadUrl),
    pagination: {
      total,
      limit,
      skip
    }
  };
};

export const getAnalysisById = async (id: string) => {
  const analysis = await DatasetAnalysis.findById(id);
  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }

  return withDownloadUrl(analysis);
};

export const updateAnalysis = async (id: string, updateData: UpdateAnalysisData) => {
  const analysis = await DatasetAnalysis.findByIdAndUpdate(
    id,
    {
      dataset: updateData.dataset,
      size: updateData.size,
      data: updateData.data
    },
    { new: true }
  );

  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }

  logger.info('Dataset analysis updated', { id: analysis._id, dataset: analysis.dataset });

  return withDownloadUrl(analysis);
};

export const getAnalysisByDataset = async (dataset: string, { limit, skip }: Omit<GetAnalysesOptions, 'dataset'>) => {
  const total = await DatasetAnalysis.countDocuments({ dataset });
  const analyses = await DatasetAnalysis.find({ dataset })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);

  return {
    analyses,
    pagination: {
      total,
      limit,
      skip
    }
  };
};

export const deleteAnalysis = async (id: string) => {
  const analysis = await DatasetAnalysis.findByIdAndDelete(id);
  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }

  logger.info('Dataset analysis deleted', { id: analysis._id });
};

export const compareAnalyses = async (analysisIds: string[]) => {
  const analyses = await DatasetAnalysis.find({ _id: { $in: analysisIds } })
    .sort({ timestamp: -1 });

  const comparison = analyses.map((analysis) => ({
    analysis: {
      _id: analysis._id,
      dataset: analysis.dataset,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt
    },
    data: analysis.data
  }));

  return {
    comparison,
    summary: {
      totalAnalyses: analyses.length,
      datasets: [...new Set(analyses.map((analysis) => analysis.dataset))]
    }
  };
};
