// Training Types
export interface Training {
  _id: string;
  uuid: string;
  training_uuid?: string; // Alternative UUID field name
  name: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  projectId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tags?: string[];
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  metrics?: {
    totalTime: number;
    epochCount: number;
    maxEpoch: number;
    lastEpochTimestamp: string | null;
    cpuCost: number;
    gpuCost: number;
    totalCost: number;
  };
}

// Epoch Types
export interface EpochMetrics {
  iou?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  [key: string]: any;
}

export interface EpochResults {
  train?: {
    loss?: number;
    mean_iou?: number;
    [className: string]: EpochMetrics | number | undefined;
  };
  val?: {
    loss?: number;
    mean_iou?: number;
    [className: string]: EpochMetrics | number | undefined;
  };
  system_info?: SystemInfo;
  [key: string]: any;
}

// System Info Types
export interface SystemInfo {
  // CPU metrics
  cpu_percent?: number;
  cpu_count?: number;
  cpu_count_logical?: number;
  cpu_count_physical?: number;

  // Memory metrics
  memory_percent?: number;
  memory_used_gb?: number;
  memory_total_gb?: number;
  memory_max_gb?: number;

  // Process info
  process?: {
    cpu_percent?: number;
    memory_gb?: number;
    threads?: number;
  };

  // GPU info (nested under gpu.gpu_0)
  gpu?: {
    gpu_0?: {
      memory_used_gb?: number;
      memory_max_gb?: number;
      memory_reserved_gb?: number;
      memory_utilization_percent?: number;
      gpu_utilization_percent?: number;
      memory_bandwidth_percent?: number;
      temperature_celsius?: number;
      power_watts?: number;
      power_limit_watts?: number;
      power_percent?: number;
      clock_sm_mhz?: number;
      clock_memory_mhz?: number;
      fan_speed_percent?: number;
    };
  };

  // GPU direct fields
  gpu_name?: string;
  gpu_memory_total_gb?: number;
  gpu_driver?: string;

  // Legacy hardware specs (strings)
  cpu?: string;
  memory?: string;
  os?: string;
  python_version?: string;
  cuda_version?: string;

  // Legacy metrics structure (for future use)
  cpu_metrics?: {
    percent: number;
    count: number;
    physical_count: number;
  };
  memory_metrics?: {
    percent: number;
    used: number;
    total: number;
  };
  gpu_metrics?: {
    utilization: number;
    memory: {
      used: number;
      total: number;
      reserved: number;
    };
    temperature: number;
    power: {
      current: number;
      limit: number;
    };
    clocks: {
      graphics_mhz: number;
      memory_mhz: number;
      video_mhz: number;
    };
    fan_speed_percent: number;
  };
}

export interface Epoch {
  _id: string;
  trainingId: string;
  training_uuid: string;
  epoch_uuid: string;
  epoch: number;
  timestamp: string;
  results: EpochResults;
  learning_rate?: number;
  epoch_time?: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// Config Types
export interface Config {
  _id: string;
  config_uuid: string;
  summary: string;
  config_data: Record<string, any>;
  config_name?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    [key: string]: T[] | any; // Allow any key for different data types
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

// Specific paginated response types for different endpoints
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

export interface CommentsPaginatedResponse extends PaginatedResponse<Comment> {
  data: {
    comments: Comment[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

export interface EpochsPaginatedResponse extends PaginatedResponse<Epoch> {
  data: {
    epochs: Epoch[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
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

export interface TrainingsPaginatedResponse extends PaginatedResponse<Training> {
  data: {
    trainings: Training[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
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

export interface TestResultsPaginatedResponse extends PaginatedResponse<TestResult> {
  data: {
    testResults: TestResult[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
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

// Training with Epochs
export interface TrainingWithEpochs {
  training: Training;
  epochs: Epoch[];
}

// Create/Update Types
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
}

export interface CreateTrainingData {
  uuid?: string;
  name: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  projectId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  tags?: string[];
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, any>;
}

export interface CreateEpochData {
  trainingId: string;
  training_uuid: string;
  epoch_uuid?: string;
  epoch: number;
  timestamp?: string;
  results: EpochResults;
  learning_rate?: number;
  epoch_time?: number;
  metadata?: Record<string, any>;
}

export interface CreateConfigData {
  trainingId?: string;
  summary: string;
  config_data: Record<string, any>;
  config_name?: string;
  metadata?: Record<string, any>;
}

// Comment Types
export interface Comment {
  _id: string;
  name: string;
  comment: string;
  trainingId: string;
  section?: string; // e.g., 'iou_chart', 'loss_chart', 'precision_chart', etc.
  parentId?: string;
  replies?: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommentData {
  name: string;
  comment: string;
  trainingId: string;
  section?: string;
  parentId?: string;
}

export interface UpdateCommentData {
  name?: string;
  comment?: string;
}

// Test Result Types
export interface TestResultMetrics {
  iou: number;
  precision: number;
  recall: number;
  f1_score: number;
  f1?: number; // Alternative field name used in some API responses
  mean_f1?: number; // Alternative field name used in some API responses
  average_precision: number;
}

export interface InferenceTimeMetrics {
  total_seconds: number;
  samples: number;
  batches: number;
  avg_per_sample_ms: number;
  avg_per_batch_ms: number;
  throughput_fps: number;
}

export interface TestResultCondition {
  pedestrian: TestResultMetrics;
  sign: TestResultMetrics;
  cyclist: TestResultMetrics;
  vehicle: TestResultMetrics;
  human: TestResultMetrics;
  inference_time: InferenceTimeMetrics;
  [className: string]: TestResultMetrics | InferenceTimeMetrics;
}

export interface TestResultData {
  day_fair: TestResultCondition;
  night_fair: TestResultCondition;
  day_rain: TestResultCondition;
  night_rain: TestResultCondition;
  snow: TestResultCondition;
  [condition: string]: TestResultCondition;
}

export interface TestResult {
  _id: string;
  timestamp: string;
  epoch: number;
  epoch_uuid: string;
  test_uuid: string;
  test_results: TestResultData;
  createdAt: string;
  updatedAt: string;
  training?: {
    _id: string;
    name: string;
    uuid: string;
    status: string;
  };
  epoch_info?: {
    epoch: number;
    epoch_time: number;
  };
}

export interface CreateTestResultData {
  timestamp?: string;
  epoch: number;
  epoch_uuid: string;
  test_uuid?: string;
  test_results: TestResultData;
}

// Benchmark Types
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

// Visualization Types
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

// Comparison Types
export interface Comparison {
  _id: string;
  uuid: string;
  name: string;
  description?: string;
  type: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds: string[];
  projectId?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateComparisonData {
  uuid?: string;
  name: string;
  description?: string;
  type: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds: string[];
  projectId?: string;
  metadata?: any;
}

export interface UpdateComparisonData {
  name?: string;
  description?: string;
  type?: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds?: string[];
  metadata?: any;
}

export interface ComparisonsPaginatedResponse extends PaginatedResponse<Comparison> {
  data: {
    comparisons: Comparison[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

// Training Comparison Types
export interface ComparisonEpoch {
  epoch: number;
  results: any;
  epoch_time?: number;
  timestamp: string;
}

export interface TrainingComparison {
  training: {
    _id: string;
    name: string;
    description?: string;
    status: Training['status'];
    createdAt: string;
    updatedAt: string;
  };
  metrics: {
    totalEpochs: number;
    totalTime: number;
    avgEpochTime: number;
    maxEpochTime: number;
    cost: {
      totalHours: number;
      cpuCost: number;
      gpuCost: number;
      totalCost: number;
    };
  };
  lastEpoch: ComparisonEpoch | null;
  epochs: ComparisonEpoch[];
}

export interface TrainingComparisonResponse {
  comparison: TrainingComparison[];
  summary: {
    totalTrainings: number;
    trainingsWithEpochs: number;
  };
}
