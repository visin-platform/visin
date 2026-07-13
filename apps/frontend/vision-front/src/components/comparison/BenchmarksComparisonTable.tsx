import React, { useState } from 'react';
import { Typography, Box } from '@mui/material';
import LatexCodeDialog from './LatexCodeDialog';
import BenchmarkDeviceTable from './BenchmarkDeviceTable';
import { generateBenchmarkDeviceLatex } from '../../utils/latex/benchmarkComparisonLatex';
import type { BenchmarkResult } from '../../types';

// Only `_id`/`results`/`training_name` are read below — not the full Benchmark shape.
interface BenchmarkWithTrainingName {
  _id: string;
  training_name: string;
  results: BenchmarkResult[];
}

interface BenchmarksComparisonTableProps {
  benchmarks: BenchmarkWithTrainingName[];
}

const BenchmarksComparisonTable: React.FC<BenchmarksComparisonTableProps> = ({ benchmarks }) => {
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [gpuSortColumn, setGpuSortColumn] = useState<string>('training_name');
  const [gpuSortDirection, setGpuSortDirection] = useState<'asc' | 'desc'>('asc');
  const [cpuSortColumn, setCpuSortColumn] = useState<string>('training_name');
  const [cpuSortDirection, setCpuSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleGpuSort = (column: string) => {
    if (gpuSortColumn === column) {
      setGpuSortDirection(gpuSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setGpuSortColumn(column);
      setGpuSortDirection('desc');
    }
  };

  const handleCpuSort = (column: string) => {
    if (cpuSortColumn === column) {
      setCpuSortDirection(cpuSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setCpuSortColumn(column);
      setCpuSortDirection('desc');
    }
  };

  // Separate CPU and GPU results
  const cpuResults = benchmarks.filter(b =>
    b.results && b.results.some((r) => r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu'))
  ).flatMap(b =>
    b.results.filter((r) => r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu'))
      .map((r) => ({ ...r, training_name: b.training_name || 'Unknown', benchmark_id: b._id }))
  );

  const gpuResults = benchmarks.filter(b =>
    b.results && b.results.some((r) => r.device_type === 'gpu' || r.device_type === 'cuda' || r.device?.toLowerCase().includes('gpu') || (!r.device_type && !r.device))
  ).flatMap(b =>
    b.results.filter((r) => r.device_type === 'gpu' || r.device_type === 'cuda' || r.device?.toLowerCase().includes('gpu') || (!r.device_type && !r.device))
      .map((r) => ({ ...r, training_name: b.training_name || 'Unknown', benchmark_id: b._id }))
  );

  if (benchmarks.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          No benchmarks available for comparison
        </Typography>
      </Box>
    );
  }

  const handleExportLatex = (device: 'gpu' | 'cpu') => {
    const results = device === 'gpu' ? gpuResults : cpuResults;
    setLatexCode(generateBenchmarkDeviceLatex(results, device));
    setLatexModalOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <BenchmarkDeviceTable
        device="gpu"
        results={gpuResults}
        sortColumn={gpuSortColumn}
        sortDirection={gpuSortDirection}
        onSort={handleGpuSort}
        onExportLatex={() => handleExportLatex('gpu')}
      />
      <BenchmarkDeviceTable
        device="cpu"
        results={cpuResults}
        sortColumn={cpuSortColumn}
        sortDirection={cpuSortDirection}
        onSort={handleCpuSort}
        onExportLatex={() => handleExportLatex('cpu')}
      />
      {cpuResults.length === 0 && gpuResults.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" sx={{ color: "text.secondary" }}>
            No benchmark results found for comparison
          </Typography>
        </Box>
      )}
      {/* LaTeX Modal */}
      <LatexCodeDialog
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        latexCode={latexCode}
        copyToClipboard={(text) => navigator.clipboard.writeText(text)}
      />
    </Box>
  );
};

export default BenchmarksComparisonTable;
