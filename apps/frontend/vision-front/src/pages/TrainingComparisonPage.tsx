import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Checkbox
} from '@mui/material';
import {
  Code as CodeIcon,
  Close as CloseIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { trainingService } from '../services/trainingService';
import { comparisonService } from '../services/comparisonService';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';

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

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  };

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  const getStatusColor = (status: string): 'success' | 'error' | 'default' | 'warning' => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'default';
      case 'failed':
        return 'error';
      case 'pending':
        return 'default';
      default:
        return 'default';
    }
  };

  const generateLatexTable = () => {
    if (!comparisonData.length) return '';

    // Generate LaTeX table for training comparison
    let latex = `\\begin{table}[h]\n\\centering\n\\caption{Training Comparison Results}\n\\label{tab:training_comparison}\n\\begin{tabular}{|l|${'c|'.repeat(comparisonData.length)}}\n\\hline\n`;

    // Header row with training names
    latex += 'Metric ';
    comparisonData.forEach(comp => {
      latex += `& ${comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&')} `;
    });
    latex += '\\\\ \\hline\n';

    // Training Status
    latex += 'Status ';
    comparisonData.forEach(comp => {
      latex += `& ${comp.training.status} `;
    });
    latex += '\\\\ \\hline\n';

    // Total Epochs
    latex += 'Total Epochs ';
    comparisonData.forEach(comp => {
      latex += `& ${comp.metrics.totalEpochs} `;
    });
    latex += '\\\\ \\hline\n';

    // Total Time
    latex += 'Total Time ';
    comparisonData.forEach(comp => {
      latex += `& ${formatTime(comp.metrics.totalTime)} `;
    });
    latex += '\\\\ \\hline\n';

    // Average Epoch Time
    latex += 'Avg Epoch Time ';
    comparisonData.forEach(comp => {
      latex += `& ${formatTime(comp.metrics.avgEpochTime)} `;
    });
    latex += '\\\\ \\hline\n';

    // Total Cost
    latex += 'Total Cost (€) ';
    comparisonData.forEach(comp => {
      latex += `& ${comp.metrics.cost.totalCost.toFixed(2)} `;
    });
    latex += '\\\\ \\hline\n';

      // Last Epoch Results (if available)
      if (comparisonData.some(comp => getSelectedEpochData(comp.training._id))) {
        latex += '\\hline\n';
        latex += '\\multicolumn{' + (comparisonData.length + 1) + '}{|c|}{Selected Epoch Results} \\\\\n';
        latex += '\\hline\n';

        // Train Loss
        latex += 'Train Loss ';
        comparisonData.forEach(comp => {
          const selectedEpochData = getSelectedEpochData(comp.training._id);
          const loss = selectedEpochData?.results?.train?.loss;
          latex += `& ${formatNumber(loss)} `;
        });
        latex += '\\\\ \\hline\n';

        // Val Loss
        latex += 'Val Loss ';
        comparisonData.forEach(comp => {
          const selectedEpochData = getSelectedEpochData(comp.training._id);
          const loss = selectedEpochData?.results?.val?.loss;
          latex += `& ${formatNumber(loss)} `;
        });
        latex += '\\\\ \\hline\n';

        // Train mIoU
        latex += 'Train mIoU ';
        comparisonData.forEach(comp => {
          const selectedEpochData = getSelectedEpochData(comp.training._id);
          const miou = selectedEpochData?.results?.train?.mean_iou;
          latex += `& ${formatNumber(miou)} `;
        });
        latex += '\\\\ \\hline\n';

        // Val mIoU
        latex += 'Val mIoU ';
        comparisonData.forEach(comp => {
          const selectedEpochData = getSelectedEpochData(comp.training._id);
          const miou = selectedEpochData?.results?.val?.mean_iou;
          latex += `& ${formatNumber(miou)} `;
        });
        latex += '\\\\ \\hline\n';

        // Per-class IoU metrics
        const allClasses = new Set<string>();
        comparisonData.forEach(comp => {
          const selectedEpochData = getSelectedEpochData(comp.training._id);
          if (selectedEpochData?.results?.val) {
            Object.keys(selectedEpochData.results.val).forEach(key => {
              if (typeof selectedEpochData.results.val![key] === 'object' &&
                  selectedEpochData.results.val![key] !== null &&
                  key !== 'loss' && key !== 'mean_iou') {
                allClasses.add(key);
              }
            });
          }
        });

        const classNames = Array.from(allClasses).sort();
        if (classNames.length > 0) {
          latex += '\\hline\n';
          latex += '\\multicolumn{' + (comparisonData.length * 4 + 1) + '}{|c|}{Per-Class Metrics (Validation)} \\\\\n';
          latex += '\\hline\n';

          // Header row with training names spanning 4 columns each
          latex += 'Class ';
          comparisonData.forEach(comp => {
            latex += `& \\multicolumn{4}{c|}{${comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&')}} `;
          });
          latex += '\\\\ \\hline\n';

          // Sub-header row with metric names
          latex += ' ';
          comparisonData.forEach(() => {
            latex += '& IoU & Precision & Recall & F1 ';
          });
          latex += '\\\\ \\hline\n';

          // Data rows for each class
          classNames.forEach(className => {
            // Calculate max values for this class across all trainings
            const classMaxValues = {
              iou: Math.max(...comparisonData.map(comp => {
                const selectedEpochData = getSelectedEpochData(comp.training._id);
                const valResults = selectedEpochData?.results?.val;
                const classMetrics = valResults?.[className] as any;
                return classMetrics?.iou ?? -Infinity;
              })),
              precision: Math.max(...comparisonData.map(comp => {
                const selectedEpochData = getSelectedEpochData(comp.training._id);
                const valResults = selectedEpochData?.results?.val;
                const classMetrics = valResults?.[className] as any;
                return classMetrics?.precision ?? -Infinity;
              })),
              recall: Math.max(...comparisonData.map(comp => {
                const selectedEpochData = getSelectedEpochData(comp.training._id);
                const valResults = selectedEpochData?.results?.val;
                const classMetrics = valResults?.[className] as any;
                return classMetrics?.recall ?? -Infinity;
              })),
              f1: Math.max(...comparisonData.map(comp => {
                const selectedEpochData = getSelectedEpochData(comp.training._id);
                const valResults = selectedEpochData?.results?.val;
                const classMetrics = valResults?.[className] as any;
                return classMetrics?.f1 ?? -Infinity;
              }))
            };

            latex += `${className.charAt(0).toUpperCase() + className.slice(1)} `;
            comparisonData.forEach(comp => {
              const selectedEpochData = getSelectedEpochData(comp.training._id);
              const valResults = selectedEpochData?.results?.val;
              const classMetrics = valResults?.[className] as any;
              const iou = classMetrics?.iou;
              const precision = classMetrics?.precision;
              const recall = classMetrics?.recall;
              const f1 = classMetrics?.f1;

              // IoU with bold formatting for max value
              const iouText = formatNumber(iou);
              latex += `& ${iou === classMaxValues.iou && iou !== undefined ? `\\textbf{${iouText}}` : iouText} `;

              // Precision with bold formatting for max value
              const precisionText = formatNumber(precision);
              latex += `& ${precision === classMaxValues.precision && precision !== undefined ? `\\textbf{${precisionText}}` : precisionText} `;

              // Recall with bold formatting for max value
              const recallText = formatNumber(recall);
              latex += `& ${recall === classMaxValues.recall && recall !== undefined ? `\\textbf{${recallText}}` : recallText} `;

              // F1 with bold formatting for max value
              const f1Text = formatNumber(f1);
              latex += `& ${f1 === classMaxValues.f1 && f1 !== undefined ? `\\textbf{${f1Text}}` : f1Text} `;
            });
            latex += '\\\\ \\hline\n';
          });
        }
      }    latex += '\\end{tabular}\n\\end{table}';

    return latex;
  };

  const handleGenerateLatex = () => {
    const latex = generateLatexTable();
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
      <Container maxWidth="lg" sx={{ py: 4 }}>
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
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading training comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
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
    <Container maxWidth="xl" sx={{ py: 4 }}>
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

      {/* Detailed Comparison Table */}
      {comparisonData.length > 0 && (
        <Paper sx={{ mb: 4 }}>
          <Box sx={{ p: 3, pb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Detailed Comparison
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Metric</strong></TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      <Link 
                        to={`/trainings/${comp.training._id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <strong>{comp.training.name}</strong>
                      </Link>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Status</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      <Chip
                        label={comp.training.status}
                        color={getStatusColor(comp.training.status)}
                        size="small"
                      />
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Total Epochs</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      {comp.metrics.totalEpochs}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Total Training Time</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      {formatTime(comp.metrics.totalTime)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Average Epoch Time</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      {formatTime(comp.metrics.avgEpochTime)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Maximum Epoch Time</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      {formatTime(comp.metrics.maxEpochTime)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Total Cost (€)</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      {comp.metrics.cost.totalCost.toFixed(2)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>CPU Cost (€)</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      {comp.metrics.cost.cpuCost.toFixed(2)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>GPU Cost (€)</TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell key={comp.training._id} align="center">
                      {comp.metrics.cost.gpuCost.toFixed(2)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Best Validation mIoU</TableCell>
                  {comparisonData.map((comp) => {
                    const bestVmIoU = Math.max(...comp.epochs.map(epoch => epoch.results?.val?.mean_iou ?? -Infinity));
                    return (
                      <TableCell key={comp.training._id} align="center">
                        {bestVmIoU !== -Infinity ? formatNumber(bestVmIoU) : 'N/A'}
                      </TableCell>
                    );
                  })}
                </TableRow>
                <TableRow>
                  <TableCell>Top 5 Validation mIoU Average</TableCell>
                  {comparisonData.map((comp) => {
                    const vmIoUs = comp.epochs
                      .map(epoch => epoch.results?.val?.mean_iou)
                      .filter(vmIoU => vmIoU !== undefined)
                      .sort((a, b) => (b ?? 0) - (a ?? 0))
                      .slice(0, 5);
                    const average = vmIoUs.length > 0 ? vmIoUs.reduce((sum, vmIoU) => sum + (vmIoU ?? 0), 0) / vmIoUs.length : undefined;
                    return (
                      <TableCell key={comp.training._id} align="center">
                        {average !== undefined ? formatNumber(average) : 'N/A'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Selected Epoch Results */}
      {comparisonData.some(comp => getSelectedEpochData(comp.training._id)) && (
        <Paper>
          <Box sx={{ p: 3, pb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Selected Epoch Performance
            </Typography>
            
            {/* Epoch Selection Controls */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              {comparisonData.map((comparison) => {
                const selectedEpoch = selectedEpochs[comparison.training._id];
                const availableEpochs = comparison.epochs.map(e => e.epoch).sort((a, b) => b - a); // Sort descending
                
                return (
                  <Box key={comparison.training._id} sx={{ minWidth: 200 }}>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                      {comparison.training.name}
                    </Typography>
                    <FormControl fullWidth size="small">
                      <InputLabel>Select Epoch</InputLabel>
                      <Select
                        value={selectedEpoch || ''}
                        label="Select Epoch"
                        onChange={(e) => handleEpochChange(comparison.training._id, Number(e.target.value))}
                      >
                        {availableEpochs.map((epoch) => (
                          <MenuItem key={epoch} value={epoch}>
                            Epoch {epoch}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                );
              })}
            </Box>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Metric</strong></TableCell>
                  {comparisonData.map((comp) => {
                    const selectedEpochData = getSelectedEpochData(comp.training._id);
                    return (
                      <TableCell key={comp.training._id} align="center">
                        <Link 
                          to={`/trainings/${comp.training._id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <strong>{comp.training.name}</strong>
                          {selectedEpochData && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Epoch {selectedEpochData.epoch}
                            </Typography>
                          )}
                        </Link>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Train Loss</TableCell>
                  {comparisonData.map((comp) => {
                    const selectedEpochData = getSelectedEpochData(comp.training._id);
                    return (
                      <TableCell key={comp.training._id} align="center">
                        {formatNumber(selectedEpochData?.results?.train?.loss)}
                      </TableCell>
                    );
                  })}
                </TableRow>
                <TableRow>
                  <TableCell>Validation Loss</TableCell>
                  {comparisonData.map((comp) => {
                    const selectedEpochData = getSelectedEpochData(comp.training._id);
                    return (
                      <TableCell key={comp.training._id} align="center">
                        {formatNumber(selectedEpochData?.results?.val?.loss)}
                      </TableCell>
                    );
                  })}
                </TableRow>
                <TableRow>
                  <TableCell>Train mIoU</TableCell>
                  {comparisonData.map((comp) => {
                    const selectedEpochData = getSelectedEpochData(comp.training._id);
                    return (
                      <TableCell key={comp.training._id} align="center">
                        {formatNumber(selectedEpochData?.results?.train?.mean_iou)}
                      </TableCell>
                    );
                  })}
                </TableRow>
                <TableRow>
                  <TableCell>Validation mIoU</TableCell>
                  {comparisonData.map((comp) => {
                    const selectedEpochData = getSelectedEpochData(comp.training._id);
                    return (
                      <TableCell key={comp.training._id} align="center">
                        {formatNumber(selectedEpochData?.results?.val?.mean_iou)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Per-Class IoU Comparison */}
      {comparisonData.some(comp => getSelectedEpochData(comp.training._id)?.results?.val) && (
        <Paper sx={{ mb: 4 }}>
          <Box sx={{ p: 3, pb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'text.primary' }}>
              Per-Class IoU Comparison (Selected Epochs)
            </Typography>
          </Box>

          {/* Extract all unique class names from all trainings */}
          {(() => {
            const allClasses = new Set<string>();
            comparisonData.forEach(comp => {
              const selectedEpochData = getSelectedEpochData(comp.training._id);
              if (selectedEpochData?.results?.val) {
                Object.keys(selectedEpochData.results.val).forEach(key => {
                  if (typeof selectedEpochData.results.val![key] === 'object' &&
                      selectedEpochData.results.val![key] !== null &&
                      key !== 'loss' && key !== 'mean_iou') {
                    allClasses.add(key);
                  }
                });
              }
            });

            const classNames = Array.from(allClasses).sort();

            if (classNames.length === 0) {
              return (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No per-class metrics available for selected epochs
                  </Typography>
                </Box>
              );
            }

            return (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell rowSpan={2} sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}>
                        <strong>Class</strong>
                      </TableCell>
                      {comparisonData.map((comp) => {
                        const selectedEpochData = getSelectedEpochData(comp.training._id);
                        return (
                          <TableCell
                            key={comp.training._id}
                            colSpan={4}
                            align="center"
                            sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}
                          >
                            <Link 
                              to={`/trainings/${comp.training._id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <strong>{comp.training.name}</strong>
                              {selectedEpochData && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Epoch {selectedEpochData.epoch}
                                </Typography>
                              )}
                            </Link>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    <TableRow>
                      {comparisonData.map((comp) => (
                        <React.Fragment key={comp.training._id}>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>IoU</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Precision</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Recall</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>F1</TableCell>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {classNames.map((className) => {
                      // Calculate max values for each metric across all trainings for this class
                      const maxValues = {
                        iou: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as any;
                          return classMetrics?.iou ?? -Infinity;
                        })),
                        precision: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as any;
                          return classMetrics?.precision ?? -Infinity;
                        })),
                        recall: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as any;
                          return classMetrics?.recall ?? -Infinity;
                        })),
                        f1: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as any;
                          return classMetrics?.f1 ?? -Infinity;
                        }))
                      };

                      return (
                        <TableRow key={className}>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {className.charAt(0).toUpperCase() + className.slice(1)}
                          </TableCell>
                          {comparisonData.map((comp) => {
                            const selectedEpochData = getSelectedEpochData(comp.training._id);
                            const valResults = selectedEpochData?.results?.val;
                            const classMetrics = valResults?.[className] as any;

                            return (
                              <React.Fragment key={comp.training._id}>
                                <TableCell align="center">
                                  {classMetrics?.iou !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.iou === maxValues.iou ? 700 : 'normal',
                                        opacity: classMetrics.iou === maxValues.iou ? 1 : 0.8
                                      }}
                                    >
                                      {formatNumber(classMetrics.iou)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">
                                  {classMetrics?.precision !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.precision === maxValues.precision ? 700 : 'normal'
                                      }}
                                    >
                                      {formatNumber(classMetrics.precision)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">
                                  {classMetrics?.recall !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.recall === maxValues.recall ? 700 : 'normal'
                                      }}
                                    >
                                      {formatNumber(classMetrics.recall)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">
                                  {classMetrics?.f1 !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.f1 === maxValues.f1 ? 700 : 'normal'
                                      }}
                                    >
                                      {formatNumber(classMetrics.f1)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                              </React.Fragment>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })()}
        </Paper>
      )}

      {/* LaTeX Modal */}
      <Dialog
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          LaTeX Table Code
          <IconButton
            onClick={() => setLatexModalOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Copy this LaTeX code to include the training comparison table in your documents:
          </Typography>
          <Paper sx={{ p: 2, bgcolor: 'grey.100', fontFamily: 'monospace', fontSize: '0.875rem' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {latexCode}
            </pre>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLatexModalOpen(false)}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              navigator.clipboard.writeText(latexCode);
              // Could add a toast notification here
            }}
          >
            Copy to Clipboard
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save Comparison Modal */}
      <Dialog
        open={saveModalOpen}
        onClose={() => !saving && setSaveModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Save Comparison
          <IconButton
            onClick={() => !saving && setSaveModalOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
            disabled={saving}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Comparison Name"
              value={comparisonName}
              onChange={(e) => setComparisonName(e.target.value)}
              sx={{ mb: 2 }}
              disabled={saving}
              required
            />
            <TextField
              fullWidth
              label="Description (optional)"
              value={comparisonDescription}
              onChange={(e) => setComparisonDescription(e.target.value)}
              multiline
              rows={3}
              sx={{ mb: 3 }}
              disabled={saving}
            />
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Select trainings to include in comparison:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {comparisonData.length > 0 ? comparisonData.map((comp) => (
                <Box key={comp.training._id} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={selectedTrainingIds.includes(comp.training._id)}
                    onChange={() => handleTrainingIdToggle(comp.training._id)}
                    disabled={saving}
                    id={`training-${comp.training._id}`}
                  />
                  <label 
                    htmlFor={`training-${comp.training._id}`}
                    style={{ 
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.5 : 1,
                      marginLeft: 8
                    }}
                  >
                    {comp.training.name}
                  </label>
                </Box>
              )) : (
                <Typography variant="body2" color="text.secondary">
                  No training data available
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSaveModalOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveComparison}
            disabled={saving || !comparisonName.trim() || selectedTrainingIds.length === 0}
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {saving ? 'Saving...' : 'Save Comparison'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TrainingComparisonPage;