import mongoose, { Document, Schema } from 'mongoose';

export interface IBenchmark extends Document {
  training_uuid?: string;
  training_id?: mongoose.Types.ObjectId | null;
  epoch_uuid?: string;
  epoch?: number;
  timestamp: Date;
  system_info: {
    cpu_count: number;
    cpu_count_logical: number;
    memory_total_gb: number;
    gpu_name?: string;
    gpu_memory_total_gb?: number;
    gpu_driver?: string;
  };
  results: Array<{
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
  }>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const BenchmarkSchema: Schema = new Schema(
  {
    training_uuid: {
      type: String,
      index: true
    },
    training_id: {
      type: Schema.Types.ObjectId,
      ref: 'training',
      index: true
    },
    epoch_uuid: {
      type: String,
      index: true
    },
    epoch: {
      type: Number,
      index: true
    },
    timestamp: {
      type: Date,
      required: true
    },
    system_info: {
      cpu_count: { type: Number, required: true },
      cpu_count_logical: { type: Number, required: true },
      memory_total_gb: { type: Number, required: true },
      gpu_name: String,
      gpu_memory_total_gb: Number,
      gpu_driver: String
    },
    results: [{
      config_path: String,
      modality: String,
      total_parameters: Number,
      trainable_parameters: Number,
      total_parameters_m: Number,
      trainable_parameters_m: Number,
      model_name: String,
      backbone: String,
      dataset: String,
      image_size: Number,
      pretrained: Boolean,
      flops_available: Boolean,
      total_flops: Number,
      flops_giga: Number,
      flops_method: String,
      mean_time_ms: Number,
      std_time_ms: Number,
      min_time_ms: Number,
      max_time_ms: Number,
      fps: Number,
      num_runs: Number,
      baseline_gpu_memory_mb: Number,
      baseline_ram_memory_mb: Number,
      ram_memory_mean_mb: Number,
      ram_memory_std_mb: Number,
      ram_memory_max_mb: Number,
      gpu_memory_mean_mb: Number,
      gpu_memory_std_mb: Number,
      gpu_memory_max_mb: Number,
      device: String,
      device_type: String
    }]
  },
  {
    timestamps: true,
    collection: 'benchmarks'
  }
);

// Add soft delete functionality
BenchmarkSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  return this.save();
};

// Add static method to find non-deleted benchmarks
BenchmarkSchema.statics.findActive = function (query: mongoose.QueryFilter<IBenchmark> = {}) {
  return this.find({ ...query, deletedAt: null });
};

const Benchmark = mongoose.model<IBenchmark>('Benchmark', BenchmarkSchema);

export default Benchmark;