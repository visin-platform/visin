import { PaginatedResponse } from './api';

export interface Visualization {
  _id: string;
  epoch_uuid: string;
  visualization_uuid: string;
  filename: string;
  type: string;
  minioFileId: string;
  uploadedAt: string;
  metadata?: Record<string, any>;
  signedUrl?: string;
  urlExpiresAt?: string;
  epoch?: number;
  training_uuid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingVisualizations {
  training_uuid: string;
  training_name: string;
  visualizations: Visualization[];
}

export interface VisualizationsGroupedResponse {
  trainings: TrainingVisualizations[];
  total: number;
}

export interface CreateVisualizationData {
  epoch_uuid: string;
  visualization_uuid: string;
  filename: string;
  type: string;
  minioFileId: string;
  mimetype: string;
  size: number;
  metadata?: Record<string, any>;
}

export interface VisualizationUploadUrlRequest {
  epoch_uuid: string;
  filename: string;
  type: string;
  mimetype: string;
}

export interface VisualizationUploadUrlResponse {
  uploadUrl: string;
  visualization_uuid: string;
  minioFileId: string;
  epoch_uuid: string;
  expiresInMinutes: number;
}

export interface VisualizationsPaginatedResponse extends PaginatedResponse<Visualization> {
  data: {
    visualizations: Visualization[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
