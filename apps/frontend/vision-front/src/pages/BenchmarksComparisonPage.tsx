import React from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { benchmarkService } from '../services/benchmarkService';
import { usePageTitle } from '../hooks/usePageTitle';
import LatexModal from '../components/common/LatexModal';

// Helper function to generate LaTeX for benchmark comparison
const generateBenchmarkLatex = (cpuResults: any[], gpuResults: any[]) => {
  let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Benchmark Performance Comparison}\n\\label{tab:benchmark_comparison}\n`;

  // GPU Results Table
  if (gpuResults.length > 0) {
    latex += `\\begin{tabular}{|l|c|c|c|c|}\n\\hline\n`;
    latex += `Training & Mean Time (ms) & FPS & GPU Memory (MB) & RAM Memory (MB) \\\\\n\\hline\n`;

    gpuResults.forEach(result => {
      const trainingName = result.training_name || 'Unknown';
      const meanTime = result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A';
      const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
      const gpuMemory = result.gpu_memory_mean_mb && result.gpu_memory_std_mb
        ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
        : result.gpu_memory_mean_mb
          ? result.gpu_memory_mean_mb.toFixed(0)
          : 'N/A';
      const ramMemory = result.ram_memory_mean_mb && result.ram_memory_std_mb
        ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
        : result.ram_memory_mean_mb
          ? result.ram_memory_mean_mb.toFixed(0)
          : 'N/A';

      latex += `${trainingName.replace(/[&%$#_{}~^\\]/g, '\\$&')} & ${meanTime} & ${fps} & ${gpuMemory} & ${ramMemory} \\\\\n`;
    });

    latex += `\\hline\n\\end{tabular}\n\n`;
  }

  // CPU Results Table
  if (cpuResults.length > 0) {
    latex += `\\begin{tabular}{|l|c|c|c|c|}\n\\hline\n`;
    latex += `Training & Mean Time (ms) & FPS & GPU Memory (MB) & RAM Memory (MB) \\\\\n\\hline\n`;

    cpuResults.forEach(result => {
      const trainingName = result.training_name || 'Unknown';
      const meanTime = result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A';
      const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
      const gpuMemory = result.gpu_memory_mean_mb && result.gpu_memory_std_mb
        ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
        : result.gpu_memory_mean_mb
          ? result.gpu_memory_mean_mb.toFixed(0)
          : 'N/A';
      const ramMemory = result.ram_memory_mean_mb && result.ram_memory_std_mb
        ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
        : result.ram_memory_mean_mb
          ? result.ram_memory_mean_mb.toFixed(0)
          : 'N/A';

      latex += `${trainingName.replace(/[&%$#_{}~^\\]/g, '\\$&')} & ${meanTime} & ${fps} & ${gpuMemory} & ${ramMemory} \\\\\n`;
    });

    latex += `\\hline\n\\end{tabular}\n`;
  }

  latex += `\\end{table*}\n`;

  return latex;
};

const BenchmarksComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Set page title
  usePageTitle('Benchmarks Comparison - Vision');

  // LaTeX export state
  const [latexModalOpen, setLatexModalOpen] = React.useState(false);
  const [latexCode, setLatexCode] = React.useState('');
  const [latexTitle, setLatexTitle] = React.useState('');

  // Get benchmark IDs from URL params
  const benchmarkIds = React.useMemo(() =>
    searchParams.get('ids')?.split(',') || [],
    [searchParams]
  );

  // Fetch benchmarks data
  const { data: benchmarksResponse, isLoading: isBenchmarksLoading, error: benchmarksError } = useQuery({
    queryKey: ['benchmarks-comparison', benchmarkIds],
    queryFn: async () => {
      if (benchmarkIds.length === 0) return { data: { benchmarks: [] } };

      // Fetch each benchmark individually
      const benchmarkPromises = benchmarkIds.map(id => benchmarkService.getBenchmarkById(id));
      const results = await Promise.all(benchmarkPromises);

      return {
        data: {
          benchmarks: results.map(result => result.data)
        }
      };
    },
    enabled: benchmarkIds.length > 0
  });

  const benchmarks = benchmarksResponse?.data?.benchmarks || [];

  if (benchmarkIds.length === 0) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
        <Alert severity="warning">
          No benchmark IDs provided for comparison.
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/benchmarks')} sx={{ mt: 2 }}>
          Back to Benchmarks
        </Button>
      </Container>
    );
  }

  if (isBenchmarksLoading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (benchmarksError) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
        <Alert severity="error">
          Failed to load benchmarks for comparison.
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/benchmarks')} sx={{ mt: 2 }}>
          Back to Benchmarks
        </Button>
      </Container>
    );
  }

  // Helper function to get training name and project ID
  const getTrainingInfo = (benchmark: any) => {
    let trainingName = 'Standalone';
    let projectId = null;

    if (benchmark.training_id && typeof benchmark.training_id === 'object' && 'name' in benchmark.training_id) {
      trainingName = benchmark.training_id.name;
      // Try to get projectId from training data
      if (benchmark.training_id.projectId) {
        projectId = benchmark.training_id.projectId;
      }
    } else if (benchmark.training_uuid) {
      trainingName = 'Training';
    }

    return { trainingName, projectId };
  };

  // Helper function to separate CPU and GPU results
  const separateResultsByDevice = (benchmarks: any[]) => {
    const cpuResults: any[] = [];
    const gpuResults: any[] = [];

    benchmarks.forEach(benchmark => {
      const { trainingName, projectId } = getTrainingInfo(benchmark);

      if (benchmark.results && benchmark.results.length > 0) {
        benchmark.results.forEach((result: any) => {
          const resultWithBenchmark = {
            ...result,
            benchmark_id: benchmark._id,
            training_name: trainingName,
            project_id: projectId,
            epoch: benchmark.epoch,
            timestamp: benchmark.timestamp,
            system_info: benchmark.system_info
          };

          if (result.device_type === 'cpu' || result.device?.toLowerCase().includes('cpu')) {
            cpuResults.push(resultWithBenchmark);
          } else if (result.device_type === 'gpu' || result.device?.toLowerCase().includes('gpu')) {
            gpuResults.push(resultWithBenchmark);
          } else {
            // If no device type specified, assume GPU for now
            gpuResults.push(resultWithBenchmark);
          }
        });
      }
    });

    return { cpuResults, gpuResults };
  };

  const { cpuResults, gpuResults } = separateResultsByDevice(benchmarks);

  // Handler for generating LaTeX
  const handleGenerateLatex = () => {
    const latex = generateBenchmarkLatex(cpuResults, gpuResults);
    setLatexCode(latex);
    setLatexTitle('Benchmark Comparison LaTeX Code');
    setLatexModalOpen(true);
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
      <Box sx={{ mb: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/benchmarks')}
          sx={{ mb: 2, color: 'text.secondary' }}
        >
          Back to Benchmarks
        </Button>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
              Benchmarks Comparison
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              Comparing {benchmarks.length} benchmark{benchmarks.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CodeIcon />}
              onClick={handleGenerateLatex}
              disabled={benchmarks.length === 0}
            >
              LaTeX
            </Button>
          </Box>
        </Box>
      </Box>

      {benchmarks.length === 0 ? (
        <Alert severity="info">
          No benchmarks found for the provided IDs.
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* GPU Results Table */}
          {gpuResults.length > 0 && (
            <Box>
              <Typography variant="h5" component="h2" gutterBottom fontWeight="bold" sx={{ mb: 2 }}>
                GPU Benchmarks Comparison
              </Typography>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Training</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Mean Time (ms)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>FPS</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>GPU Memory (MB)</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>RAM Memory (MB)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {gpuResults.map((result: any, index: number) => (
                      <TableRow key={`${result.benchmark_id}-${index}`} hover>
                        <TableCell>
                          <Typography variant="body2">
                            {result.training_name}
                          </Typography>
                          {result.epoch !== undefined && (
                            <Typography variant="caption" color="text.secondary">
                              Epoch {result.epoch}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {result.fps?.toFixed(2) || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2">
                            {result.gpu_memory_mean_mb && result.gpu_memory_std_mb
                              ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
                              : result.gpu_memory_mean_mb
                                ? result.gpu_memory_mean_mb.toFixed(0)
                                : 'N/A'
                            }
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2">
                            {result.ram_memory_mean_mb && result.ram_memory_std_mb
                              ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
                              : result.ram_memory_mean_mb
                                ? result.ram_memory_mean_mb.toFixed(0)
                                : 'N/A'
                            }
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* CPU Results Table */}
          {cpuResults.length > 0 && (
            <Box>
              <Typography variant="h5" component="h2" gutterBottom fontWeight="bold" sx={{ mb: 2 }}>
                CPU Benchmarks Comparison
              </Typography>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Training</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Mean Time (ms)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>FPS</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>GPU Memory (MB)</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>RAM Memory (MB)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cpuResults.map((result: any, index: number) => (
                      <TableRow key={`${result.benchmark_id}-${index}`} hover>
                        <TableCell>
                          <Typography variant="body2">
                            {result.training_name}
                          </Typography>
                          {result.epoch !== undefined && (
                            <Typography variant="caption" color="text.secondary">
                              Epoch {result.epoch}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {result.fps?.toFixed(2) || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2">
                            {result.gpu_memory_mean_mb && result.gpu_memory_std_mb
                              ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
                              : result.gpu_memory_mean_mb
                                ? result.gpu_memory_mean_mb.toFixed(0)
                                : 'N/A'
                            }
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2">
                            {result.ram_memory_mean_mb && result.ram_memory_std_mb
                              ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
                              : result.ram_memory_mean_mb
                                ? result.ram_memory_mean_mb.toFixed(0)
                                : 'N/A'
                            }
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {cpuResults.length === 0 && gpuResults.length === 0 && (
            <Alert severity="info">
              No benchmark results found for comparison.
            </Alert>
          )}
        </Box>
      )}

      {/* LaTeX Modal */}
      <LatexModal
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        title={latexTitle}
        code={latexCode}
      />
    </Container>
  );
};

export default BenchmarksComparisonPage;