import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
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
import { testResultService } from '../services/testResultService';
import { comparisonService } from '../services/comparisonService';
import { usePageTitle } from '../hooks/usePageTitle';

const TestResultsComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Set page title
  usePageTitle('Test Results Comparison - Vision');
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');

  // State for save comparison modal
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [comparisonName, setComparisonName] = useState('');
  const [comparisonDescription, setComparisonDescription] = useState('');
  const [selectedTestResultIds, setSelectedTestResultIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Get test result IDs from URL params
  const testResultIds = useMemo(() => searchParams.get('ids')?.split(',') || [], [searchParams]);

  // Update selected test result IDs when testResultIds changes
  useEffect(() => {
    setSelectedTestResultIds(testResultIds);
  }, [testResultIds]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['testResultsComparison', testResultIds],
    queryFn: () => testResultService.compareTestResults(testResultIds),
    enabled: testResultIds.length > 0
  });

  const comparisonData = data?.data?.comparison || [];

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  const generateLatexTable = () => {
    if (!comparisonData.length) return '';

    // Generate LaTeX table similar to the provided example
    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Performance metrics comparison for test results.}\n`;

    // Extract all unique class names
    const allClasses = new Set<string>();
    comparisonData.forEach(comp => {
      Object.values(comp.test_results).forEach((conditionData: any) => {
        if (conditionData && typeof conditionData === 'object') {
          Object.keys(conditionData).forEach(className => {
            if (className !== 'inference_time') {
              allClasses.add(className);
            }
          });
        }
      });
    });
    const classNames = Array.from(allClasses).sort();

    // Generate table for each condition
    ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].forEach(condition => {
      // Calculate max values for bold formatting
      const maxValues: Record<string, { iou: number; precision: number; recall: number; ap: number }> = {};
      classNames.forEach(className => {
        maxValues[className] = {
          iou: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.iou ?? -Infinity;
          })),
          precision: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.precision ?? -Infinity;
          })),
          recall: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.recall ?? -Infinity;
          })),
          ap: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.ap ?? -Infinity;
          }))
        };
      });

      latex += `\\begin{tabular}{|l|${'cccc|'.repeat(classNames.length)}}\n\\hline\n`;

      // Header row with class names
      latex += `& \\multicolumn{4}{c|}{${classNames.map(name => name.charAt(0).toUpperCase() + name.slice(1)).join('} & \\multicolumn{4}{c|}{')}} \\\\\n\\hline\n`;

      // Sub-header row with metrics
      latex += `Test Result & ${classNames.map(() => 'IoU & Precision & Recall & AP').join(' & ')} \\\\\n\\hline\n`;

      // Data rows
      comparisonData.forEach(comp => {
        const trainingName = comp.training?.name || 'Unknown';
        const testId = `Test ${comp.testResult.test_uuid.slice(-8)}`;
        latex += `${trainingName.replace(/[&%$#_{}~^\\]/g, '\\$&')} $\\rightarrow$ ${testId} & `;

        classNames.forEach((className, classIndex) => {
          const conditionData = comp.test_results[condition];
          const classMetrics = conditionData?.[className];

          const iou = classMetrics?.iou;
          const precision = classMetrics?.precision;
          const recall = classMetrics?.recall;
          const ap = classMetrics?.ap;

          // IoU with bold formatting for max value
          const iouText = iou !== undefined ? formatNumber(iou) : 'N/A';
          latex += `${iou === maxValues[className].iou && iou !== undefined ? `\\textbf{${iouText}}` : iouText} & `;

          // Precision with bold formatting for max value
          const precisionText = precision !== undefined ? formatNumber(precision) : 'N/A';
          latex += `${precision === maxValues[className].precision && precision !== undefined ? `\\textbf{${precisionText}}` : precisionText} & `;

          // Recall with bold formatting for max value
          const recallText = recall !== undefined ? formatNumber(recall) : 'N/A';
          latex += `${recall === maxValues[className].recall && recall !== undefined ? `\\textbf{${recallText}}` : recallText} & `;

          // AP with bold formatting for max value
          const apText = ap !== undefined ? formatNumber(ap) : 'N/A';
          latex += `${ap === maxValues[className].ap && ap !== undefined ? `\\textbf{${apText}}` : apText}`;

          // Add separator between classes (except for last class)
          if (classIndex < classNames.length - 1) {
            latex += ' & ';
          }
        });

        latex += ' \\\\\n\\hline\n';
      });

      latex += `\\end{tabular}\n\\caption*{${condition.replace('_', ' ').toUpperCase()} conditions}\n\\vspace{1em}\n\n`;
    });

    latex += `\\label{table:test_results_comparison}\n\\end{table*}`;

    return latex;
  };

  const generatePerformanceLatexTable = () => {
    if (!comparisonData.length) return '';

    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Performance metrics comparison for test results.}\n`;

    // Extract all unique class names
    const allClasses = new Set<string>();
    comparisonData.forEach(comp => {
      Object.values(comp.test_results).forEach((conditionData: any) => {
        if (conditionData && typeof conditionData === 'object') {
          Object.keys(conditionData).forEach(className => {
            if (className !== 'inference_time') {
              allClasses.add(className);
            }
          });
        }
      });
    });
    const classNames = Array.from(allClasses).sort();

    // Generate table for each condition
    ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].forEach(condition => {
      // Calculate max values for bold formatting
      const maxValues: Record<string, { iou: number; precision: number; recall: number; ap: number }> = {};
      classNames.forEach(className => {
        maxValues[className] = {
          iou: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.iou ?? -Infinity;
          })),
          precision: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.precision ?? -Infinity;
          })),
          recall: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.recall ?? -Infinity;
          })),
          ap: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.ap ?? -Infinity;
          }))
        };
      });

      latex += `\\begin{tabular}{|l|${'cccc|'.repeat(classNames.length)}}\n\\hline\n`;

      // Header row with class names
      latex += `& \\multicolumn{4}{c|}{${classNames.map(name => name.charAt(0).toUpperCase() + name.slice(1)).join('} & \\multicolumn{4}{c|}{')}} \\\\\n\\hline\n`;

      // Sub-header row with metrics
      latex += `Test Result & ${classNames.map(() => 'IoU & Precision & Recall & AP').join(' & ')} \\\\\n\\hline\n`;

      // Data rows
      comparisonData.forEach(comp => {
        const trainingName = comp.training?.name || 'Unknown';
        const testId = `Test ${comp.testResult.test_uuid.slice(-8)} (Epoch ${comp.testResult.epoch})`;
        latex += `${trainingName.replace(/[&%$#_{}~^\\]/g, '\\$&')} $\\rightarrow$ ${testId} & `;

        classNames.forEach((className, classIndex) => {
          const conditionData = comp.test_results[condition];
          const classMetrics = conditionData?.[className];

          const iou = classMetrics?.iou;
          const precision = classMetrics?.precision;
          const recall = classMetrics?.recall;
          const ap = classMetrics?.ap;

          // IoU with bold formatting for max value
          const iouText = iou !== undefined ? formatNumber(iou) : 'N/A';
          latex += `${iou === maxValues[className].iou && iou !== undefined ? `\\textbf{${iouText}}` : iouText} & `;

          // Precision with bold formatting for max value
          const precisionText = precision !== undefined ? formatNumber(precision) : 'N/A';
          latex += `${precision === maxValues[className].precision && precision !== undefined ? `\\textbf{${precisionText}}` : precisionText} & `;

          // Recall with bold formatting for max value
          const recallText = recall !== undefined ? formatNumber(recall) : 'N/A';
          latex += `${recall === maxValues[className].recall && recall !== undefined ? `\\textbf{${recallText}}` : recallText} & `;

          // AP with bold formatting for max value
          const apText = ap !== undefined ? formatNumber(ap) : 'N/A';
          latex += `${ap === maxValues[className].ap && ap !== undefined ? `\\textbf{${apText}}` : apText}`;

          // Add separator between classes (except for last class)
          if (classIndex < classNames.length - 1) {
            latex += ' & ';
          }
        });

        latex += ' \\\\\n\\hline\n';
      });

      latex += `\\end{tabular}\n\\caption*{${condition.replace('_', ' ').toUpperCase()} conditions}\n\\vspace{1em}\n\n`;
    });

    latex += `\\label{table:performance_metrics_comparison}\n\\end{table*}`;

    return latex;
  };

  const generatePerClassLatexTable = () => {
    if (!comparisonData.length) return '';

    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Per-class metrics comparison for test results.}\n`;

    // Extract all unique class names
    const allClasses = new Set<string>();
    comparisonData.forEach(comp => {
      Object.values(comp.test_results).forEach((conditionData: any) => {
        if (conditionData && typeof conditionData === 'object') {
          Object.keys(conditionData).forEach(className => {
            if (className !== 'inference_time') {
              allClasses.add(className);
            }
          });
        }
      });
    });
    const classNames = Array.from(allClasses).sort();

    // Generate table for each condition
    ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].forEach(condition => {
      // Calculate max values for bold formatting
      const maxValues: Record<string, { iou: number; precision: number; recall: number; f1: number; ap: number }> = {};
      classNames.forEach(className => {
        maxValues[className] = {
          iou: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.iou ?? -Infinity;
          })),
          precision: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.precision ?? -Infinity;
          })),
          recall: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.recall ?? -Infinity;
          })),
          f1: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            const f1Value = classMetrics?.f1_score ?? classMetrics?.f1 ?? classMetrics?.mean_f1;
            return (f1Value !== undefined && f1Value !== null && !isNaN(f1Value)) ? f1Value : -Infinity;
          })),
          ap: Math.max(...comparisonData.map(comp => {
            const conditionData = comp.test_results[condition];
            const classMetrics = conditionData?.[className];
            return classMetrics?.ap ?? -Infinity;
          }))
        };
      });

      latex += `\\begin{tabular}{|l|${'ccccc|'.repeat(comparisonData.length)}}\n\\hline\n`;

      // Header row with condition and training names
      latex += `${condition.replace('_', ' ').toUpperCase()} & ${comparisonData.map(comp => `\\multicolumn{5}{c|}{${(comp.training?.name || 'Unknown').replace(/[&%$#_{}~^\\]/g, '\\$&')}}`).join(' & ')} \\\\\n\\hline\n`;

      // Sub-header row with metrics
      latex += `Class & ${comparisonData.map(() => 'IoU & Precision & Recall & AP & F1').join(' & ')} \\\\\n\\hline\n`;

      // Data rows
      classNames.forEach(className => {
        latex += `${className.charAt(0).toUpperCase() + className.slice(1)} & `;

        comparisonData.forEach((comp, compIndex) => {
          const conditionData = comp.test_results[condition];
          const classMetrics = conditionData?.[className];

          const iou = classMetrics?.iou;
          const precision = classMetrics?.precision;
          const recall = classMetrics?.recall;
          const ap = classMetrics?.ap;
          const f1 = classMetrics?.f1_score ?? classMetrics?.f1 ?? classMetrics?.mean_f1;

          // IoU with bold formatting for max value
          const iouText = iou !== undefined ? formatNumber(iou) : 'N/A';
          latex += `${iou === maxValues[className].iou && iou !== undefined ? `\\textbf{${iouText}}` : iouText} & `;

          // Precision with bold formatting for max value
          const precisionText = precision !== undefined ? formatNumber(precision) : 'N/A';
          latex += `${precision === maxValues[className].precision && precision !== undefined ? `\\textbf{${precisionText}}` : precisionText} & `;

          // Recall with bold formatting for max value
          const recallText = recall !== undefined ? formatNumber(recall) : 'N/A';
          latex += `${recall === maxValues[className].recall && recall !== undefined ? `\\textbf{${recallText}}` : recallText} & `;

          // AP with bold formatting for max value
          const apText = ap !== undefined ? formatNumber(ap) : 'N/A';
          latex += `${ap === maxValues[className].ap && ap !== undefined ? `\\textbf{${apText}}` : apText} & `;

          // F1 with bold formatting for max value
          const f1Text = f1 !== undefined ? formatNumber(f1) : 'N/A';
          latex += `${f1 === maxValues[className].f1 && f1 !== undefined ? `\\textbf{${f1Text}}` : f1Text}`;

          // Add separator between trainings (except for last training)
          if (compIndex < comparisonData.length - 1) {
            latex += ' & ';
          }
        });

        latex += ' \\\\\n\\hline\n';
      });

      latex += `\\end{tabular}\n\\vspace{1em}\n\n`;
    });

    latex += `\\label{table:per_class_metrics_comparison}\n\\end{table*}`;

    return latex;
  };

  const handleGenerateLatex = (type: 'performance' | 'perClass' | 'all') => {
    let latex = '';
    let title = '';

    switch (type) {
      case 'performance':
        latex = generatePerformanceLatexTable();
        title = 'Performance Metrics LaTeX Table';
        break;
      case 'perClass':
        latex = generatePerClassLatexTable();
        title = 'Per-Class Metrics LaTeX Table';
        break;
      case 'all':
      default:
        latex = generateLatexTable();
        title = 'LaTeX Table Code';
        break;
    }

    setLatexCode(latex);
    setLatexTitle(title);
    setLatexModalOpen(true);
  };

  const handleGeneratePerformanceLatex = () => handleGenerateLatex('performance');
  const handleGeneratePerClassLatex = () => handleGenerateLatex('perClass');

  const handleSaveComparison = async () => {
    if (!comparisonName.trim()) return;

    try {
      setSaving(true);
      await comparisonService.createComparison({
        name: comparisonName.trim(),
        description: comparisonDescription.trim(),
        type: 'tests',
        itemIds: selectedTestResultIds,
      });

      // Reset form and close modal
      setComparisonName('');
      setComparisonDescription('');
      setSelectedTestResultIds(testResultIds);
      setSaveModalOpen(false);

      // Could add a success notification here
    } catch (error) {
      console.error('Error saving comparison:', error);
      // Could add an error notification here
    } finally {
      setSaving(false);
    }
  };

  const handleTestResultIdToggle = (testResultId: string) => {
    setSelectedTestResultIds(prev =>
      prev.includes(testResultId)
        ? prev.filter(id => id !== testResultId)
        : [...prev, testResultId]
    );
  };

  if (testResultIds.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning">
          No test result IDs provided. Please select test results to compare from the test results list.
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/test-results')}>
            Back to Test Results
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
          Loading test results comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          Failed to load test results comparison: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/test-results')}>
            Back to Test Results
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
            Test Results Comparison
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comparing {comparisonData.length} test result{comparisonData.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<CodeIcon />}
            onClick={handleGeneratePerformanceLatex}
            disabled={comparisonData.length === 0}
          >
            LaTeX
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => {
              setSaveModalOpen(true);
              // Reset form when opening modal
              setComparisonName('');
              setComparisonDescription('');
              setSelectedTestResultIds(testResultIds);
            }}
            disabled={comparisonData.length === 0}
            color="secondary"
          >
            Save
          </Button>
          <Button
            variant="contained"
            onClick={() => navigate('/test-results')}
          >
            Back to Test Results
          </Button>
        </Box>
      </Box>

      {/* Compact Performance Comparison Table */}
      {comparisonData.length > 0 && (
        <Paper sx={{ mb: 4 }}>
          <Box sx={{ p: 3, pb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Performance Metrics Comparison
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CodeIcon />}
                onClick={handleGeneratePerformanceLatex}
                disabled={comparisonData.length === 0}
              >
                LaTeX
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Comparing test results across different conditions and classes
            </Typography>
          </Box>

          {/* Extract all unique class names from all test results */}
          {(() => {
            const allClasses = new Set<string>();
            comparisonData.forEach(comp => {
              Object.values(comp.test_results).forEach((conditionData: any) => {
                if (conditionData && typeof conditionData === 'object') {
                  Object.keys(conditionData).forEach(className => {
                    if (className !== 'inference_time') {
                      allClasses.add(className);
                    }
                  });
                }
              });
            });

            const classNames = Array.from(allClasses).sort();

            if (classNames.length === 0) {
              return (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No metrics available for comparison
                  </Typography>
                </Box>
              );
            }

            return ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].map(condition => {
              // Calculate max values for each metric and class across all test results for this condition
              const maxValues: Record<string, { iou: number; precision: number; recall: number; ap: number }> = {};
              classNames.forEach(className => {
                maxValues[className] = {
                  iou: Math.max(...comparisonData.map(comp => {
                    const conditionData = comp.test_results[condition];
                    const classMetrics = conditionData?.[className];
                    return classMetrics?.iou ?? -Infinity;
                  })),
                  precision: Math.max(...comparisonData.map(comp => {
                    const conditionData = comp.test_results[condition];
                    const classMetrics = conditionData?.[className];
                    return classMetrics?.precision ?? -Infinity;
                  })),
                  recall: Math.max(...comparisonData.map(comp => {
                    const conditionData = comp.test_results[condition];
                    const classMetrics = conditionData?.[className];
                    return classMetrics?.recall ?? -Infinity;
                  })),
                  ap: Math.max(...comparisonData.map(comp => {
                    const conditionData = comp.test_results[condition];
                    const classMetrics = conditionData?.[className];
                    return classMetrics?.ap ?? -Infinity;
                  }))
                };
              });

              return (
                <TableContainer key={condition} component={Paper} sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 120 }}>
                          Test Result
                        </TableCell>
                        {classNames.map((className) => (
                          <TableCell
                            key={className}
                            colSpan={4}
                            align="center"
                            sx={{
                              fontWeight: 600,
                              borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                            }}
                          >
                            {className.charAt(0).toUpperCase() + className.slice(1)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)' }}>
                          {condition.replace('_', ' ').toUpperCase()}
                        </TableCell>
                        {classNames.map((className) => (
                          <React.Fragment key={className}>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>IoU</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Precision</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Recall</TableCell>
                            <TableCell
                              align="center"
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                              }}
                            >
                              AP
                            </TableCell>
                          </React.Fragment>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {comparisonData.map((comp) => (
                        <TableRow key={comp.testResult._id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'grey.25' } }}>
                          <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 150 }}>
                            <Link 
                              to={`/trainings/${comp.training?._id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 600, display: 'inline' }}>
                                {comp.training?.name || 'Unknown Training'}
                              </Typography>
                            </Link>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'normal', display: 'inline', ml: 1 }}>
                              Test {comp.testResult.test_uuid.slice(-8)} (Epoch {comp.testResult.epoch})
                            </Typography>
                          </TableCell>
                          {classNames.map((className) => {
                            const conditionData = comp.test_results[condition];
                            const classMetrics = conditionData?.[className];

                            return (
                              <React.Fragment key={className}>
                                <TableCell align="center">
                                  {classMetrics?.iou !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.iou === maxValues[className].iou ? 700 : 'normal'
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
                                        fontWeight: classMetrics.precision === maxValues[className].precision ? 700 : 'normal'
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
                                        fontWeight: classMetrics.recall === maxValues[className].recall ? 700 : 'normal'
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
                                <TableCell
                                  align="center"
                                  sx={{
                                    borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                                  }}
                                >
                                  {classMetrics?.ap !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.ap === maxValues[className].ap ? 700 : 'normal'
                                      }}
                                    >
                                      {formatNumber(classMetrics.ap)}
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
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            });
          })()}
        </Paper>
      )}

      {/* Per-Class Comparison */}
      {comparisonData.length > 0 && (
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 3, pb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Per-Class Metrics Comparison
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CodeIcon />}
              onClick={handleGeneratePerClassLatex}
              disabled={comparisonData.length === 0}
            >
              LaTeX
            </Button>
          </Box>
        </Box>          {/* Extract all unique class names from all test results */}
          {(() => {
            const allClasses = new Set<string>();
            comparisonData.forEach(comp => {
              Object.values(comp.test_results).forEach((conditionData: any) => {
                if (conditionData && typeof conditionData === 'object') {
                  Object.keys(conditionData).forEach(className => {
                    if (className !== 'inference_time') {
                      allClasses.add(className);
                    }
                  });
                }
              });
            });

            const classNames = Array.from(allClasses).sort();

            if (classNames.length === 0) {
              return (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No per-class metrics available
                  </Typography>
                </Box>
              );
            }

            return ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].map(condition => (
              <Box key={condition} sx={{ mb: 4 }}>
                <Typography variant="h6" sx={{ mb: 2, textTransform: 'capitalize', ml: 2 }}>
                  {condition.replace('_', ' ')} - Per-Class Metrics
                </Typography>
                <TableContainer component={Paper} sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}>
                          <strong>{condition.replace('_', ' ').toUpperCase()}</strong>
                        </TableCell>
                        {comparisonData.map((comp) => (
                          <TableCell
                            key={comp.testResult._id}
                            colSpan={5}
                            align="center"
                            sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}
                          >
                            <Box>
                              <Link 
                                to={`/trainings/${comp.training?._id}`}
                                style={{ textDecoration: 'none', color: 'inherit' }}
                              >
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                  {comp.training?.name || 'Unknown Training'}
                                </Typography>
                              </Link>
                              <Typography variant="caption" color="text.secondary">
                                Test {comp.testResult.test_uuid.slice(-8)} (Epoch {comp.testResult.epoch})
                              </Typography>
                            </Box>
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          Class
                        </TableCell>
                        {comparisonData.map((comp) => (
                          <React.Fragment key={comp.testResult._id}>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>IoU</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Precision</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Recall</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>AP</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem', borderRight: '2px solid rgba(224, 224, 224, 1)' }}>F1</TableCell>
                          </React.Fragment>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {classNames.map((className) => {
                        // Calculate max values for each metric across all test results for this class and condition
                        const maxValues = {
                          iou: Math.max(...comparisonData.map(comp => {
                            const conditionData = comp.test_results[condition];
                            const classMetrics = conditionData?.[className];
                            return classMetrics?.iou ?? -Infinity;
                          })),
                          precision: Math.max(...comparisonData.map(comp => {
                            const conditionData = comp.test_results[condition];
                            const classMetrics = conditionData?.[className];
                            return classMetrics?.precision ?? -Infinity;
                          })),
                          recall: Math.max(...comparisonData.map(comp => {
                            const conditionData = comp.test_results[condition];
                            const classMetrics = conditionData?.[className];
                            return classMetrics?.recall ?? -Infinity;
                          })),
                          ap: Math.max(...comparisonData.map(comp => {
                            const conditionData = comp.test_results[condition];
                            const classMetrics = conditionData?.[className];
                            return classMetrics?.ap ?? -Infinity;
                          })),
                          f1: Math.max(...comparisonData.map(comp => {
                            const conditionData = comp.test_results[condition];
                            const classMetrics = conditionData?.[className];
                            const f1Value = classMetrics?.f1_score ?? classMetrics?.f1 ?? classMetrics?.mean_f1;
                            return (f1Value !== undefined && f1Value !== null && !isNaN(f1Value)) ? f1Value : -Infinity;
                          }))
                        };

                        return (
                          <TableRow key={className}>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {className.charAt(0).toUpperCase() + className.slice(1)}
                            </TableCell>
                            {comparisonData.map((comp) => {
                              const conditionData = comp.test_results[condition];
                              const classMetrics = conditionData?.[className];

                              return (
                                <React.Fragment key={comp.testResult._id}>
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
                                    {classMetrics?.ap !== undefined ? (
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          fontWeight: classMetrics.ap === maxValues.ap ? 700 : 'normal'
                                        }}
                                      >
                                        {formatNumber(classMetrics.ap)}
                                      </Typography>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        N/A
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell align="center" sx={{ borderRight: '2px solid rgba(224, 224, 224, 1)' }}>
                                    {(() => {
                                      const f1Value = classMetrics?.f1_score ?? classMetrics?.f1 ?? classMetrics?.mean_f1;
                                      return f1Value !== undefined && f1Value !== null && !isNaN(f1Value) ? (
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            fontWeight: f1Value === maxValues.f1 ? 700 : 'normal'
                                          }}
                                        >
                                          {formatNumber(f1Value)}
                                        </Typography>
                                      ) : (
                                        <Typography variant="body2" color="text.secondary">
                                          N/A
                                        </Typography>
                                      );
                                    })()}
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
              </Box>
            ));
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
          {latexTitle}
          <IconButton
            onClick={() => setLatexModalOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Copy this LaTeX code to include the test results comparison table in your documents:
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
              Select test results to include in comparison:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {comparisonData.length > 0 ? comparisonData.map((comp) => (
                <Box key={comp.testResult._id} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={selectedTestResultIds.includes(comp.testResult._id)}
                    onChange={() => handleTestResultIdToggle(comp.testResult._id)}
                    disabled={saving}
                    id={`test-result-${comp.testResult._id}`}
                  />
                  <label
                    htmlFor={`test-result-${comp.testResult._id}`}
                    style={{
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.5 : 1,
                      marginLeft: 8
                    }}
                  >
                    {comp.training?.name || 'Unknown Training'} - Test {comp.testResult.test_uuid.slice(-8)} (Epoch {comp.testResult.epoch})
                  </label>
                </Box>
              )) : (
                <Typography variant="body2" color="text.secondary">
                  No test result data available
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
            disabled={saving || !comparisonName.trim() || selectedTestResultIds.length === 0}
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {saving ? 'Saving...' : 'Save Comparison'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TestResultsComparisonPage;