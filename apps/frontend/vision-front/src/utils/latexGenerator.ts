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
