import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BenchmarksComparisonTable from './BenchmarksComparisonTable';

const gpuBenchmark = {
  _id: 'bm1',
  training_name: 'Training GPU',
  results: [{ device_type: 'gpu', mean_time_ms: 5, fps: 200 }]
};

const cpuBenchmark = {
  _id: 'bm2',
  training_name: 'Training CPU',
  results: [{ device: 'Intel CPU', mean_time_ms: 20, fps: 50 }]
};

describe('BenchmarksComparisonTable', () => {
  it('shows empty message when there are no benchmarks', () => {
    render(<BenchmarksComparisonTable benchmarks={[]} />);
    expect(screen.getByText('No benchmarks available for comparison')).toBeInTheDocument();
  });

  it('renders GPU and CPU tables when benchmarks contain matching results', () => {
    render(<BenchmarksComparisonTable benchmarks={[gpuBenchmark, cpuBenchmark]} />);
    expect(screen.getByText('GPU Benchmarks Comparison')).toBeInTheDocument();
    expect(screen.getByText('CPU Benchmarks Comparison')).toBeInTheDocument();
    expect(screen.getByText('Training GPU')).toBeInTheDocument();
    expect(screen.getByText('Training CPU')).toBeInTheDocument();
  });

  it('shows "no benchmark results found" when benchmarks exist but have no cpu/gpu results', () => {
    const benchmark = { _id: 'bm3', training_name: 'Empty', results: [] };
    render(<BenchmarksComparisonTable benchmarks={[benchmark]} />);
    expect(screen.getByText('No benchmark results found for comparison')).toBeInTheDocument();
  });

  it('opens the LaTeX dialog with generated code when clicking LaTeX button', () => {
    render(<BenchmarksComparisonTable benchmarks={[gpuBenchmark]} />);
    const latexButtons = screen.getAllByRole('button', { name: /LaTeX/i });
    fireEvent.click(latexButtons[0]);
    expect(screen.getByText('LaTeX Table Code')).toBeInTheDocument();
  });
});
