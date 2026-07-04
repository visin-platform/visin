import { PaginatedResponse } from './api';
import { SystemInfo } from './systemInfo';

export interface BenchmarkResult {
  config_path?: string;
  modality?: string;
  total_parameters?: number;
  trainable_parameters?: number;
  total_parameters_m?: number;
  trainable_parameters_m?: number;
  model_name?: string;
  backbone?: string;
  dataset?: string;
  image_size?: number;
  pretrained?: boolean;
  flops_available?: boolean;
  total_flops?: number;
  flops_giga?: number;
  flops_method?: string;
  mean_time_ms?: number;
  std_time_ms?: number;
  min_time_ms?: number;
  max_time_ms?: number;
  fps?: number;
  num_runs?: number;
  baseline_gpu_memory_mb?: number;
  baseline_ram_memory_mb?: number;
  ram_memory_mean_mb?: number;
  ram_memory_std_mb?: number;
  ram_memory_max_mb?: number;
  gpu_memory_mean_mb?: number;
  gpu_memory_std_mb?: number;
  gpu_memory_max_mb?: number;
  device?: string;
  device_type?: string;
  framework?: string;
  parameters?: number;
  flops?: number;
  memory_usage?: number;
  input_size?: string;
  precision?: string;
  batch_size?: number;
  warmup_iterations?: number;
  benchmark_iterations?: number;
  metadata?: Record<string, any>;
}

export interface Benchmark {
  _id: string;
  training_uuid?: string;
  training_id?: string | {
    _id: string;
    name: string;
    uuid: string;
  };
  epoch_uuid?: string;
  epoch?: number;
  timestamp: string;
  system_info: SystemInfo;
  results: BenchmarkResult[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface BenchmarkStats {
  totalBenchmarks: number;
  totalResults: number;
  avgParameters: number;
  avgFlops: number;
  avgFps: number;
  avgMemoryUsage: number;
}

export interface CreateBenchmarkData {
  training_uuid?: string;
  epoch_uuid?: string;
  epoch?: number;
  timestamp?: string;
  system_info: SystemInfo;
  results: BenchmarkResult[];
}

export interface BenchmarksPaginatedResponse extends PaginatedResponse<Benchmark> {
  data: {
    benchmarks: Benchmark[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
