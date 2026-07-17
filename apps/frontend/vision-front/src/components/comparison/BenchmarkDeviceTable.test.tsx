import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BenchmarkDeviceTable from './BenchmarkDeviceTable';

const baseResult = (overrides: any = {}) => ({
  benchmark_id: 'b1',
  training_name: 'Training A',
  mean_time_ms: 10.5,
  std_time_ms: 1.2,
  fps: 95.5,
  gpu_memory_mean_mb: 512,
  gpu_memory_std_mb: 10,
  ram_memory_mean_mb: 256,
  ram_memory_std_mb: 5,
  total_parameters_m: 25.3,
  flops_giga: 4.2,
  image_size: 512,
  num_runs: 10,
  ...overrides
});

describe('BenchmarkDeviceTable', () => {
  it('returns null when there are no results', () => {
    const { container } = render(
      <BenchmarkDeviceTable device="gpu" results={[]} sortColumn="training_name" sortDirection="asc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders GPU title and results', () => {
    render(
      <BenchmarkDeviceTable device="gpu" results={[baseResult()]} sortColumn="training_name" sortDirection="asc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    expect(screen.getByText('GPU Benchmarks Comparison')).toBeInTheDocument();
    expect(screen.getByText('Training A')).toBeInTheDocument();
    expect(screen.getByText('10.5 ± 1.2')).toBeInTheDocument();
    expect(screen.getByText('95.50')).toBeInTheDocument();
    expect(screen.getByText('512 ± 10.0')).toBeInTheDocument();
  });

  it('renders CPU title and RAM memory column for cpu device', () => {
    render(
      <BenchmarkDeviceTable device="cpu" results={[baseResult()]} sortColumn="training_name" sortDirection="asc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    expect(screen.getByText('CPU Benchmarks Comparison')).toBeInTheDocument();
    expect(screen.getByText('RAM Memory (MB)')).toBeInTheDocument();
  });

  it('renders N/A for missing metric values', () => {
    const result = baseResult({
      mean_time_ms: undefined,
      std_time_ms: undefined,
      fps: undefined,
      gpu_memory_mean_mb: undefined,
      total_parameters_m: undefined,
      flops_giga: undefined,
      image_size: undefined,
      num_runs: undefined
    });
    render(
      <BenchmarkDeviceTable device="gpu" results={[result]} sortColumn="training_name" sortDirection="asc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

  it('calls onSort when a header is clicked', () => {
    const onSort = vi.fn();
    render(
      <BenchmarkDeviceTable device="gpu" results={[baseResult()]} sortColumn="training_name" sortDirection="asc" onSort={onSort} onExportLatex={vi.fn()} />
    );
    fireEvent.click(screen.getByText('FPS'));
    expect(onSort).toHaveBeenCalledWith('fps');
  });

  it('calls onExportLatex when LaTeX button clicked', () => {
    const onExportLatex = vi.fn();
    render(
      <BenchmarkDeviceTable device="gpu" results={[baseResult()]} sortColumn="training_name" sortDirection="asc" onSort={vi.fn()} onExportLatex={onExportLatex} />
    );
    fireEvent.click(screen.getByRole('button', { name: /LaTeX/i }));
    expect(onExportLatex).toHaveBeenCalled();
  });

  it('sorts results by training name descending', () => {
    const results = [baseResult({ benchmark_id: 'b1', training_name: 'Zeta' }), baseResult({ benchmark_id: 'b2', training_name: 'Alpha' })];
    render(
      <BenchmarkDeviceTable device="gpu" results={results} sortColumn="training_name" sortDirection="desc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    const rows = screen.getAllByRole('row').slice(1); // skip header row
    expect(rows[0]).toHaveTextContent('Zeta');
    expect(rows[1]).toHaveTextContent('Alpha');
  });

  const sortableNumericColumns: Array<[string, string]> = [
    ['time', 'mean_time_ms'],
    ['fps', 'fps'],
    ['parameters', 'total_parameters_m'],
    ['flops', 'flops_giga'],
    ['image_size', 'image_size'],
    ['num_runs', 'num_runs']
  ];

  it.each(sortableNumericColumns)('sorts results by %s ascending, treating a missing value as -Infinity', (sortColumn, field) => {
    const results = [
      baseResult({ benchmark_id: 'b1', training_name: 'High', [field]: 100 }),
      baseResult({ benchmark_id: 'b2', training_name: 'Missing', [field]: undefined })
    ];
    render(
      <BenchmarkDeviceTable device="gpu" results={results} sortColumn={sortColumn} sortDirection="asc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Missing');
    expect(rows[1]).toHaveTextContent('High');
  });

  it('sorts results by the device memory column', () => {
    const results = [
      baseResult({ benchmark_id: 'b1', training_name: 'Low', gpu_memory_mean_mb: 100 }),
      baseResult({ benchmark_id: 'b2', training_name: 'High', gpu_memory_mean_mb: 900 })
    ];
    render(
      <BenchmarkDeviceTable device="gpu" results={results} sortColumn="gpu_memory" sortDirection="desc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('High');
    expect(rows[1]).toHaveTextContent('Low');
  });

  it('renders a bare value (no ±) when the mean is present but the std deviation is missing', () => {
    const result = baseResult({ mean_time_ms: 12.3, std_time_ms: undefined, gpu_memory_mean_mb: 400, gpu_memory_std_mb: undefined });
    render(
      <BenchmarkDeviceTable device="gpu" results={[result]} sortColumn="training_name" sortDirection="asc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    expect(screen.getByText('12.3')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('shows N/A for falsy-but-defined image_size and num_runs, but "0.00" for a zero fps', () => {
    const result = baseResult({ fps: 0, image_size: 0, num_runs: 0 });
    render(
      <BenchmarkDeviceTable device="gpu" results={[result]} sortColumn="training_name" sortDirection="asc" onSort={vi.fn()} onExportLatex={vi.fn()} />
    );
    // fps uses `?.toFixed()` (only null/undefined skip it), so 0 still formats.
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.getAllByText('N/A').length).toBe(2);
  });
});
