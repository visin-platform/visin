import { PaginatedResponse } from './api';

export interface CreateDatasetData {
  uuid?: string;
  name: string;
  description?: string;
  timestamp?: string;
  dataset_info?: Record<string, any>;
  annotations?: Record<string, any>;
  camera?: Record<string, any>;
  lidar?: Record<string, any>;
  metadata?: Record<string, any>;
  downloadUrl?: string;
}

export interface DatasetsPaginatedResponse extends PaginatedResponse<any> {
  data: {
    datasets: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
