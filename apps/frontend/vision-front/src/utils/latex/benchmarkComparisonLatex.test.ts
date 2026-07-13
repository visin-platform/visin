import { describe, it, expect } from 'vitest';
import { generateBenchmarkDeviceLatex } from './benchmarkComparisonLatex';

const gpuResult = {
  training_name: 'Run & 1_test',
  mean_time_ms: 12.345,
  std_time_ms: 1.2,
  fps: 30.456,
  gpu_memory_mean_mb: 2048,
  gpu_memory_std_mb: 50,
  total_parameters_m: 25.3,
  flops_giga: 4.1,
  image_size: 512,
  num_runs: 10,
};

describe('generateBenchmarkDeviceLatex', () => {
  it('renders a GPU table with escaped names and mean±std formatting', () => {
    const latex = generateBenchmarkDeviceLatex([gpuResult], 'gpu');

    expect(latex).toContain('GPU Benchmark Performance Comparison');
    expect(latex).toContain('GPU Memory (MB)');
    expect(latex).toContain('Run \\& 1\\_test');
    expect(latex).toContain('12.3 ± 1.2');
    expect(latex).toContain('2048 ± 50.0');
  });

  it('renders a CPU table using RAM memory fields', () => {
    const cpuResult = { ...gpuResult, ram_memory_mean_mb: 1024, ram_memory_std_mb: 20 };

    const latex = generateBenchmarkDeviceLatex([cpuResult], 'cpu');

    expect(latex).toContain('CPU Benchmark Performance Comparison');
    expect(latex).toContain('RAM Memory (MB)');
    expect(latex).toContain('1024 ± 20.0');
  });

  it('falls back to N/A and single-value formatting when std/optional fields are missing', () => {
    const sparse = { training_name: 'Sparse', mean_time_ms: 5 };

    const latex = generateBenchmarkDeviceLatex([sparse], 'gpu');

    expect(latex).toContain('5.0'); // mean_time_ms alone, no std
    expect(latex).toMatch(/N\/A/);
  });

  it('handles an empty results array', () => {
    const latex = generateBenchmarkDeviceLatex([], 'gpu');

    expect(latex).toContain('\\begin{table*}[ht]');
    expect(latex).toContain('\\end{table*}');
  });
});
