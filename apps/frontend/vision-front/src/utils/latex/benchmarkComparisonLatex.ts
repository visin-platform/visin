import type { BenchmarkResult } from '@/types';

type BenchmarkResultWithTrainingName = BenchmarkResult & { training_name: string };

/**
 * LaTeX generator for a single device's (GPU or CPU) benchmark comparison
 * table, extracted from BenchmarksComparisonTable so the same formatting
 * logic backs both the "LaTeX" button per-table and (via
 * comparisonExportLatex.ts) the page-level "Export All LaTeX" dialog.
 */
export function generateBenchmarkDeviceLatex(results: BenchmarkResultWithTrainingName[], device: 'gpu' | 'cpu'): string {
  const memoryLabel = device === 'gpu' ? 'GPU Memory (MB)' : 'RAM Memory (MB)';
  const meanKey = device === 'gpu' ? 'gpu_memory_mean_mb' : 'ram_memory_mean_mb';
  const stdKey = device === 'gpu' ? 'gpu_memory_std_mb' : 'ram_memory_std_mb';
  const caption = device === 'gpu' ? 'GPU Benchmark Performance Comparison' : 'CPU Benchmark Performance Comparison';
  const label = device === 'gpu' ? 'tab:gpu_benchmark_comparison' : 'tab:cpu_benchmark_comparison';

  let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{${caption}}\n\\label{${label}}\n\\begin{tabular}{|l|c|c|c|c|c|c|c|c|}\n\\hline\nTraining & Time (ms) & FPS & ${memoryLabel} & Params (M) & FLOPs (G) & Image Size & Num Runs \\\\\n\\hline\n`;

  results.forEach(result => {
    const trainingName = result.training_name.replace(/[&%$#_{}~^\\]/g, '\\$&');
    const time = result.mean_time_ms && result.std_time_ms
      ? `${result.mean_time_ms.toFixed(1)} ± ${result.std_time_ms.toFixed(1)}`
      : result.mean_time_ms
        ? result.mean_time_ms.toFixed(1)
        : 'N/A';
    const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
    const memory = result[meanKey] && result[stdKey]
      ? `${result[meanKey].toFixed(0)} ± ${result[stdKey].toFixed(1)}`
      : result[meanKey]
        ? result[meanKey].toFixed(0)
        : 'N/A';
    const parameters = result.total_parameters_m ? result.total_parameters_m.toFixed(1) : 'N/A';
    const flops = result.flops_giga ? result.flops_giga.toFixed(1) : 'N/A';
    const imageSize = result.image_size || 'N/A';
    const numRuns = result.num_runs || 'N/A';

    latex += `${trainingName} & ${time} & ${fps} & ${memory} & ${parameters} & ${flops} & ${imageSize} & ${numRuns} \\\\\n`;
  });

  latex += `\\hline\n\\end{tabular}\n\\end{table*}\n`;
  return latex;
}
