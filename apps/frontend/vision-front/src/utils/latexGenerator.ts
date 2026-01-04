import { TestResult } from '../types';

export const generateLatexCode = (testResult: TestResult): string => {
  const conditions = [
    { key: 'day_fair', label: 'Dry day' },
    { key: 'day_rain', label: 'Rainy day' },
    { key: 'snow', label: 'Snow' },
    { key: 'night_fair', label: 'Dry night' },
    { key: 'night_rain', label: 'Rainy night' }
  ];

  let latex = `\\begin{table*}[ht]
\\centering
\\caption{Performance comparison during various weather conditions.}
\\begin{tabular}{|c|c|c|c|c|c|c|c|c|c|c|c|c|c|c|c|c|}
\\hline & \\multicolumn{4}{|c|}{IoU} & \\multicolumn{4}{|c|}{Precision} & \\multicolumn{4}{|c|}{Recall} & \\multicolumn{4}{|c|}{AP} & \\multicolumn{3}{|c|}{Inference Time} \\\\
\\hline & Vehicle & Sign & Cyclist+Ped & Human & Vehicle & Sign & Cyclist+Ped & Human & Vehicle & Sign & Cyclist+Ped & Human & Vehicle & Sign & Cyclist+Ped & Human & Avg (ms) & FPS & Total (s) \\\\
\\hline
`;

  conditions.forEach((condition) => {
    const conditionData = (testResult.test_results as any)[condition.key];
    if (!conditionData) return;

    const vehicle = conditionData.vehicle;
    const sign = conditionData.sign;
    const cyclistPedestrian = conditionData['cyclist + pedestrian'];
    const human = conditionData.human;
    const inferenceTime = conditionData.inference_time;

    latex += `\\multicolumn{19}{|c|}{${condition.label}} \\\\
\\hline
Camera & ${vehicle ? vehicle.iou.toFixed(4) : '-'} & ${sign ? sign.iou.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.iou.toFixed(4) : '-'} & ${human ? human.iou.toFixed(4) : '-'} & ${vehicle ? vehicle.precision.toFixed(4) : '-'} & ${sign ? sign.precision.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.precision.toFixed(4) : '-'} & ${human ? human.precision.toFixed(4) : '-'} & ${vehicle ? vehicle.recall.toFixed(4) : '-'} & ${sign ? sign.recall.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.recall.toFixed(4) : '-'} & ${human ? human.recall.toFixed(4) : '-'} & ${vehicle ? vehicle.ap.toFixed(4) : '-'} & ${sign ? sign.ap.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.ap.toFixed(4) : '-'} & ${human ? human.ap.toFixed(4) : '-'} & ${inferenceTime ? inferenceTime.avg_per_sample_ms.toFixed(2) : '-'} & ${inferenceTime ? inferenceTime.throughput_fps.toFixed(1) : '-'} & ${inferenceTime ? inferenceTime.total_seconds.toFixed(1) : '-'} \\\\
\\hline
`;
  });

  latex += `\\end{tabular}
\\label{table:performance}
\\end{table*}`;

  return latex;
};

export const generateAggregatedLatexCode = (aggregatedStats: any, hasCyclistPedestrianData: boolean, testResultsCount: number): string => {
  const conditions = [
    { key: 'day_fair', label: 'Dry day' },
    { key: 'day_rain', label: 'Rainy day' },
    { key: 'snow', label: 'Snow' },
    { key: 'night_fair', label: 'Dry night' },
    { key: 'night_rain', label: 'Rainy night' }
  ];

  const classes = ['vehicle', 'sign'];
  if (hasCyclistPedestrianData) classes.push('cyclist + pedestrian');
  classes.push('human');

  let latex = `\\begin{table*}[ht]
\\centering
\\caption{Aggregated performance metrics across ${testResultsCount} test result${testResultsCount !== 1 ? 's' : ''} (mean ± standard deviation).}
\\begin{tabular}{|c|${'c|'.repeat(classes.length * 4)}}
\\hline & \\multicolumn{${classes.length}}{|c|}{IoU} & \\multicolumn{${classes.length}}{|c|}{Precision} & \\multicolumn{${classes.length}}{|c|}{Recall} & \\multicolumn{${classes.length}}{|c|}{AP} \\\\
\\hline & ${classes.map(cls => cls.charAt(0).toUpperCase() + cls.slice(1)).join(' & ')} & ${classes.map(cls => cls.charAt(0).toUpperCase() + cls.slice(1)).join(' & ')} & ${classes.map(cls => cls.charAt(0).toUpperCase() + cls.slice(1)).join(' & ')} & ${classes.map(cls => cls.charAt(0).toUpperCase() + cls.slice(1)).join(' & ')} \\\\
\\hline
`;

  conditions.forEach((condition) => {
    const conditionData = aggregatedStats[condition.key];
    if (!conditionData) return;

    latex += `${condition.label}`;

    // IoU values
    classes.forEach((className) => {
      const metricData = conditionData[className]?.iou;
      const value = metricData && typeof metricData.mean === 'number'
        ? `${metricData.mean.toFixed(2)} ± ${metricData.std.toFixed(2)}`
        : '-';
      latex += ` & ${value}`;
    });

    // Precision values
    classes.forEach((className) => {
      const metricData = conditionData[className]?.precision;
      const value = metricData && typeof metricData.mean === 'number'
        ? `${metricData.mean.toFixed(2)} ± ${metricData.std.toFixed(2)}`
        : '-';
      latex += ` & ${value}`;
    });

    // Recall values
    classes.forEach((className) => {
      const metricData = conditionData[className]?.recall;
      const value = metricData && typeof metricData.mean === 'number'
        ? `${metricData.mean.toFixed(2)} ± ${metricData.std.toFixed(2)}`
        : '-';
      latex += ` & ${value}`;
    });

    // AP values
    classes.forEach((className) => {
      const metricData = conditionData[className]?.ap;
      const value = metricData && typeof metricData.mean === 'number'
        ? `${metricData.mean.toFixed(2)} ± ${metricData.std.toFixed(2)}`
        : '-';
      latex += ` & ${value}`;
    });

    latex += ` \\\\
\\hline
`;
  });

  latex += `\\end{tabular}
\\label{table:aggregated_performance}
\\end{table*}`;

  return latex;
};
