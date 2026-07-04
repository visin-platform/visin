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
