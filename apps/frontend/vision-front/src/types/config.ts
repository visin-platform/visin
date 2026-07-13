import { PaginatedResponse } from './api';

export interface Config {
  _id: string;
  config_uuid: string;
  summary: string;
  config_data: Record<string, unknown>;
  config_name?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConfigData {
  trainingId?: string;
  summary: string;
  config_data: Record<string, unknown>;
  config_name?: string;
  metadata?: Record<string, unknown>;
}

export interface ConfigsPaginatedResponse extends PaginatedResponse<Config> {
  data: {
    configs: Config[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
