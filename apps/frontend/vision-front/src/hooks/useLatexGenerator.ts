import { useCallback } from 'react';

interface ComparisonData {
  test_results: any;
  training?: { name: string };
  testResult: { test_uuid: string; epoch: number };
}

export const useLatexGenerator = (comparisonData: ComparisonData[]) => {
  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  const generateLatexTable = useCallback(() => {
    if (!comparisonData.length) return '';

    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Performance metrics comparison for test results.}\n`;

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

    ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].forEach(condition => {
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
      latex += `& \\multicolumn{4}{c|}{${classNames.map(name => name.charAt(0).toUpperCase() + name.slice(1)).join('} & \\multicolumn{4}{c|}{')}} \\\\\n\\hline\n`;
      latex += `Test Result & ${classNames.map(() => 'IoU & Precision & Recall & AP').join(' & ')} \\\\\n\\hline\n`;

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

          const iouText = iou !== undefined ? formatNumber(iou) : 'N/A';
          latex += `${iou === maxValues[className].iou && iou !== undefined ? `\\textbf{${iouText}}` : iouText} & `;

          const precisionText = precision !== undefined ? formatNumber(precision) : 'N/A';
          latex += `${precision === maxValues[className].precision && precision !== undefined ? `\\textbf{${precisionText}}` : precisionText} & `;

          const recallText = recall !== undefined ? formatNumber(recall) : 'N/A';
          latex += `${recall === maxValues[className].recall && recall !== undefined ? `\\textbf{${recallText}}` : recallText} & `;

          const apText = ap !== undefined ? formatNumber(ap) : 'N/A';
          latex += `${ap === maxValues[className].ap && ap !== undefined ? `\\textbf{${apText}}` : apText}`;

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
  }, [comparisonData]);

  const generatePerformanceLatexTable = useCallback(() => {
    if (!comparisonData.length) return '';

    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Performance metrics comparison for test results.}\n`;

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

    ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].forEach(condition => {
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
      latex += `& \\multicolumn{4}{c|}{${classNames.map(name => name.charAt(0).toUpperCase() + name.slice(1)).join('} & \\multicolumn{4}{c|}{')}} \\\\\n\\hline\n`;
      latex += `Test Result & ${classNames.map(() => 'IoU & Precision & Recall & AP').join(' & ')} \\\\\n\\hline\n`;

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

          const iouText = iou !== undefined ? formatNumber(iou) : 'N/A';
          latex += `${iou === maxValues[className].iou && iou !== undefined ? `\\textbf{${iouText}}` : iouText} & `;

          const precisionText = precision !== undefined ? formatNumber(precision) : 'N/A';
          latex += `${precision === maxValues[className].precision && precision !== undefined ? `\\textbf{${precisionText}}` : precisionText} & `;

          const recallText = recall !== undefined ? formatNumber(recall) : 'N/A';
          latex += `${recall === maxValues[className].recall && recall !== undefined ? `\\textbf{${recallText}}` : recallText} & `;

          const apText = ap !== undefined ? formatNumber(ap) : 'N/A';
          latex += `${ap === maxValues[className].ap && ap !== undefined ? `\\textbf{${apText}}` : apText}`;

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
  }, [comparisonData]);

  const generatePerClassLatexTable = useCallback(() => {
    if (!comparisonData.length) return '';

    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{Per-class metrics comparison for test results.}\n`;

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

    ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].forEach(condition => {
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
      latex += `${condition.replace('_', ' ').toUpperCase()} & ${comparisonData.map(comp => `\\multicolumn{5}{c|}{${(comp.training?.name || 'Unknown').replace(/[&%$#_{}~^\\]/g, '\\$&')}}`).join(' & ')} \\\\\n\\hline\n`;
      latex += `Class & ${comparisonData.map(() => 'IoU & Precision & Recall & AP & F1').join(' & ')} \\\\\n\\hline\n`;

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

          const iouText = iou !== undefined ? formatNumber(iou) : 'N/A';
          latex += `${iou === maxValues[className].iou && iou !== undefined ? `\\textbf{${iouText}}` : iouText} & `;

          const precisionText = precision !== undefined ? formatNumber(precision) : 'N/A';
          latex += `${precision === maxValues[className].precision && precision !== undefined ? `\\textbf{${precisionText}}` : precisionText} & `;

          const recallText = recall !== undefined ? formatNumber(recall) : 'N/A';
          latex += `${recall === maxValues[className].recall && recall !== undefined ? `\\textbf{${recallText}}` : recallText} & `;

          const apText = ap !== undefined ? formatNumber(ap) : 'N/A';
          latex += `${ap === maxValues[className].ap && ap !== undefined ? `\\textbf{${apText}}` : apText} & `;

          const f1Text = f1 !== undefined ? formatNumber(f1) : 'N/A';
          latex += `${f1 === maxValues[className].f1 && f1 !== undefined ? `\\textbf{${f1Text}}` : f1Text}`;

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
  }, [comparisonData]);

  return {
    generateLatexTable,
    generatePerformanceLatexTable,
    generatePerClassLatexTable
  };
};