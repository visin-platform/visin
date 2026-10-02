import mongoose, { Document, Schema } from 'mongoose';

export interface IBenchmark extends Document {
  /** Absent on legacy records; never inferred from the first editor. */
  ownerId?: string;
  training_uuid?: string;
  training_id?: mongoose.Types.ObjectId | null;
  epoch_uuid?: string;
  epoch?: number;
  benchmark_uuid?: string;
  timestamp: Date;
  system_info: {
    cpu_count: number;
    cpu_count_logical: number;
    memory_total_gb: number;
    gpu_name?: string;
    gpu_memory_total_gb?: number;
    gpu_driver?: string;
    /** whatever else the machine report carries: `os`, `torch_version`, `gpu_count`… */
    [field: string]: unknown;
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
    /** custom measurements are kept as sent: `batch_size`, `latency_p95_ms`, `energy_j`… */
    [field: string]: unknown;
  }>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const BenchmarkSchema: Schema = new Schema(
  {
    benchmark_uuid: { type: String, unique: true, sparse: true },
    ownerId: { type: String, immutable: true, index: true },
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
    system_info: { type: Schema.Types.Mixed, required: true },
    results: { type: [Schema.Types.Mixed], default: [] },
    deletedAt: {
      type: Date
    }
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

BenchmarkSchema.pre('validate', function () {
  const info = this.system_info as Record<string, unknown> | undefined;
  for (const field of ['cpu_count', 'cpu_count_logical', 'memory_total_gb']) {
    if (typeof info?.[field] !== 'number' || !Number.isFinite(info[field])) {
      this.invalidate(`system_info.${field}`, `${field} must be a number`);
    }
  }
});

const Benchmark = mongoose.model<IBenchmark>('Benchmark', BenchmarkSchema);

export default Benchmark;