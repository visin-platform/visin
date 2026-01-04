import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab
} from '@mui/material';
import {
  Code as CodeIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { trainingService } from '../services/trainingService';
import { comparisonService } from '../services/comparisonService';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { generateLatexTable } from '@/utils/comparisonLatexGenerator';
import ComparisonTable from '@/components/comparison/ComparisonTable';
import SelectedEpochPerformance from '@/components/comparison/SelectedEpochPerformance';
import SaveComparisonDialog from '@/components/comparison/SaveComparisonDialog';
import LatexCodeDialog from '@/components/comparison/LatexCodeDialog';
import PerformanceMetricsTable from '../components/test-results/PerformanceMetricsTable';
import PerClassMetricsTable from '../components/test-results/PerClassMetricsTable';
import BenchmarksComparisonTable from '../components/comparison/BenchmarksComparisonTable';

const TrainingComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Set page title
  usePageTitle('Training Comparison - Vision');
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');

  // State for save comparison modal
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [comparisonName, setComparisonName] = useState('');
  const [comparisonDescription, setComparisonDescription] = useState('');
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // State for selected epochs (defaults to last epoch)
  const [selectedEpochs, setSelectedEpochs] = useState<Record<string, number>>({});

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);

  // Set initial tab based on URL parameter
  React.useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'tests') {
      setActiveTab(1);
    } else if (tab === 'benchmarks') {
      setActiveTab(2);
    } else {
      setActiveTab(0);
    }
  }, [searchParams]);

  // Get training IDs from URL params
  const trainingIds = React.useMemo(() => 
    searchParams.get('ids')?.split(',') || [], 
    [searchParams]
  );

  // Update selected training IDs when trainingIds changes
  React.useEffect(() => {
    setSelectedTrainingIds(trainingIds);
  }, [trainingIds]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['trainingComparison', trainingIds],
    queryFn: () => trainingService.compareTrainings(trainingIds),
    enabled: trainingIds.length > 0
  });

  const comparisonData = data?.data?.comparison || [];

  // Process test results data - use the already aggregated data from backend
  const testResultsData = React.useMemo(() => {
    if (!comparisonData.length) return [];
    
    return comparisonData
      .filter(comp => comp.aggregatedTestResults !== null)
      .map(comp => ({
        aggregatedResults: comp.aggregatedTestResults,
        training: comp.training,
        testResultsCount: comp.testResultsCount || 0
      }));
  }, [comparisonData]);

  // Process benchmarks data
  const benchmarksData = React.useMemo(() => {
    if (!comparisonData.length) return [];
    
    const allBenchmarks = comparisonData.flatMap(comp => 
      comp.benchmarks.map((benchmark: any) => ({
        ...benchmark,
        training_name: comp.training.name
      }))
    );
    
    return allBenchmarks;
  }, [comparisonData]);

  // Initialize selected epochs to the epoch with best validation mIoU when data loads
  React.useEffect(() => {
    if (comparisonData.length > 0) {
      const initialSelectedEpochs: Record<string, number> = {};
      comparisonData.forEach(comp => {
        // Find epoch with best validation mean IoU
        let bestEpoch = comp.lastEpoch?.epoch || 0;
        let bestVmIoU = -Infinity;

        comp.epochs.forEach(epoch => {
          const vmIoU = epoch.results?.val?.mean_iou;
          if (vmIoU !== undefined && vmIoU > bestVmIoU) {
            bestVmIoU = vmIoU;
            bestEpoch = epoch.epoch;
          }
        });

        initialSelectedEpochs[comp.training._id] = bestEpoch;
      });
      setSelectedEpochs(initialSelectedEpochs);
    }
  }, [comparisonData]);

  // Handle epoch selection change
  const handleEpochChange = (trainingId: string, epoch: number) => {
    setSelectedEpochs(prev => ({
      ...prev,
      [trainingId]: epoch
    }));
  };

  // Get selected epoch data for a training
  const getSelectedEpochData = (trainingId: string) => {
    const selectedEpoch = selectedEpochs[trainingId];
    const trainingData = comparisonData.find(comp => comp.training._id === trainingId);
    if (!trainingData || !selectedEpoch) return null;
    
    return trainingData.epochs.find(epoch => epoch.epoch === selectedEpoch) || null;
  };

  const handleGenerateLatex = () => {
    let latex = '';

    if (activeTab === 0) {
      // Training comparison LaTeX
      latex = generateLatexTable(comparisonData, getSelectedEpochData);
    } else if (activeTab === 1) {
      // Test results LaTeX - use aggregated data with mean and std
      latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Test Results Comparison}\n\\label{tab:test_results_comparison}\n\\begin{tabular}{|l|c|c|c|c|}\n\\hline\nTraining & Mean IoU & Mean Precision & Mean Recall & Mean F1 \\\\\n\\hline\n`;
      
      testResultsData.forEach(item => {
        const trainingName = item.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
        const results = item.aggregatedResults;
        if (results && results.val) {
          const meanIou = results.val.mean_iou?.mean !== undefined 
            ? `${results.val.mean_iou.mean.toFixed(3)} ± ${results.val.mean_iou.std?.toFixed(3) || '0.000'}`
            : 'N/A';
          const meanPrecision = results.val.mean_precision?.mean !== undefined
            ? `${results.val.mean_precision.mean.toFixed(3)} ± ${results.val.mean_precision.std?.toFixed(3) || '0.000'}`
            : 'N/A';
          const meanRecall = results.val.mean_recall?.mean !== undefined
            ? `${results.val.mean_recall.mean.toFixed(3)} ± ${results.val.mean_recall.std?.toFixed(3) || '0.000'}`
            : 'N/A';
          const meanF1 = results.val.mean_f1_score?.mean !== undefined
            ? `${results.val.mean_f1_score.mean.toFixed(3)} ± ${results.val.mean_f1_score.std?.toFixed(3) || '0.000'}`
            : 'N/A';
          latex += `${trainingName} & ${meanIou} & ${meanPrecision} & ${meanRecall} & ${meanF1} \\\\\n`;
        }
      });
      
      latex += `\\hline\n\\end{tabular}\n\\end{table*}\n`;
    } else if (activeTab === 2) {
      // Benchmarks LaTeX
      latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Benchmark Performance Comparison}\n\\label{tab:benchmark_comparison}\n\\begin{tabular}{|l|c|c|c|c|}\n\\hline\nTraining & Mean Time (ms) & FPS & GPU Memory (MB) & RAM Memory (MB) \\\\\n\\hline\n`;
      
      benchmarksData.forEach(benchmark => {
        if (benchmark.results && benchmark.results.length > 0) {
          benchmark.results.forEach((result: any) => {
            const trainingName = benchmark.training_name?.replace(/[&%$#_{}~^\\]/g, '\\$&') || 'Unknown';
            const meanTime = result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A';
            const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
            const gpuMemory = result.gpu_memory_mean_mb ? result.gpu_memory_mean_mb.toFixed(0) : 'N/A';
            const ramMemory = result.ram_memory_mean_mb ? result.ram_memory_mean_mb.toFixed(0) : 'N/A';
            latex += `${trainingName} & ${meanTime} & ${fps} & ${gpuMemory} & ${ramMemory} \\\\\n`;
          });
        }
      });
      
      latex += `\\hline\n\\end{tabular}\n\\end{table*}\n`;
    }

    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  const handleSaveComparison = async () => {
    if (!comparisonName.trim()) return;

    try {
      setSaving(true);
      await comparisonService.createComparison({
        name: comparisonName.trim(),
        description: comparisonDescription.trim(),
        type: 'trainings',
        itemIds: selectedTrainingIds,
      });

      // Reset form and close modal
      setComparisonName('');
      setComparisonDescription('');
      setSelectedTrainingIds(trainingIds);
      setSaveModalOpen(false);

      // Could add a success notification here
    } catch (error) {
      console.error('Error saving comparison:', error);
      // Could add an error notification here
    } finally {
      setSaving(false);
    }
  };

  const handleTrainingIdToggle = (trainingId: string) => {
    setSelectedTrainingIds(prev =>
      prev.includes(trainingId)
        ? prev.filter(id => id !== trainingId)
        : [...prev, trainingId]
    );
  };

  if (trainingIds.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="warning">
          No training IDs provided. Please select trainings to compare from the trainings list.
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/trainings')}>
            Back to Trainings
          </Button>
        </Box>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading training comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error">
          Failed to load training comparison: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/trainings')}>
            Back to Trainings
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
            Training Comparison
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comparing {comparisonData.length} training run{comparisonData.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<CodeIcon />}
            onClick={handleGenerateLatex}
            disabled={comparisonData.length === 0}
          >
            LaTeX Table
          </Button>
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => {
                setSaveModalOpen(true);
                // Reset form when opening modal
                setComparisonName('');
                setComparisonDescription('');
                setSelectedTrainingIds(trainingIds);
              }}
              disabled={comparisonData.length === 0}
              color="secondary"
            >
              Save
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => navigate('/trainings')}
          >
            Back to Trainings
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label={`Training Runs (${comparisonData.length})`} />
          <Tab label={`Test Results (${testResultsData.length})`} />
          <Tab label={`Benchmarks (${benchmarksData.length})`} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <>
          {/* Detailed Comparison Table */}
          {comparisonData.length > 0 && (
            <ComparisonTable comparisonData={comparisonData} />
          )}

          {/* Selected Epoch Results */}
          {comparisonData.some(comp => getSelectedEpochData(comp.training._id)) && (
            <SelectedEpochPerformance
              comparisonData={comparisonData}
              selectedEpochs={selectedEpochs}
              handleEpochChange={handleEpochChange}
              getSelectedEpochData={getSelectedEpochData}
            />
          )}
        </>
      )}

      {activeTab === 1 && (
        <>
          {/* Test Results Comparison */}
          {testResultsData.length > 0 ? (
            <>
              <PerformanceMetricsTable 
                comparisonData={testResultsData} 
                onGenerateLatex={() => {}} // TODO: Implement LaTeX generation for test results
              />
              <PerClassMetricsTable 
                comparisonData={testResultsData} 
                onGenerateLatex={() => {}} // TODO: Implement LaTeX generation for per-class metrics
              />
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary">
                No test results available for comparison
              </Typography>
            </Box>
          )}
        </>
      )}

      {activeTab === 2 && (
        <>
          {/* Benchmarks Comparison */}
          <BenchmarksComparisonTable benchmarks={benchmarksData} />
        </>
      )}

      {/* LaTeX Modal */}
      <LatexCodeDialog
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        latexCode={latexCode}
        copyToClipboard={(text) => navigator.clipboard.writeText(text)}
      />

      {/* Save Comparison Modal */}
      <SaveComparisonDialog
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveComparison}
        comparisonName={comparisonName}
        setComparisonName={setComparisonName}
        comparisonDescription={comparisonDescription}
        setComparisonDescription={setComparisonDescription}
        selectedTrainingIds={selectedTrainingIds}
        handleTrainingIdToggle={handleTrainingIdToggle}
        comparisonData={comparisonData}
        saving={saving}
      />
    </Container>
  );
};

export default TrainingComparisonPage;
