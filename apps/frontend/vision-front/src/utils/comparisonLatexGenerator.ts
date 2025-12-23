import { TrainingComparison, ComparisonEpoch } from '@/types';

export const formatTime = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
};

export const formatNumber = (value: any, decimals: number = 4): string => {
  if (typeof value === 'number' && !isNaN(value)) {
    return value.toFixed(decimals);
  }
  return 'N/A';
};

export const getStatusColor = (status: string): 'success' | 'error' | 'default' | 'warning' => {
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

export const generateLatexTable = (
  comparisonData: TrainingComparison[],
  getSelectedEpochData: (trainingId: string) => ComparisonEpoch | null
) => {
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
  }
  
  latex += '\\end{tabular}\n\\end{table}';

  return latex;
};
