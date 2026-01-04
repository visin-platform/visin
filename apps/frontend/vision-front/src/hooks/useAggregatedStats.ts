import { useMemo } from 'react';
import { TestResult } from '../types';

export interface AggregatedStats {
  [condition: string]: {
    [className: string]: {
      iou: { values: number[]; mean: number; std: number };
      precision: { values: number[]; mean: number; std: number };
      recall: { values: number[]; mean: number; std: number };
      ap: { values: number[]; mean: number; std: number };
    };
  };
}

export const useAggregatedStats = (allTestResults: TestResult[]) => {
  const hasCyclistPedestrianData = useMemo(() => {
    return allTestResults.some(testResult => {
      return ['day_fair', 'day_rain', 'night_fair', 'night_rain', 'snow'].some(condition => {
        const conditionData = (testResult.test_results as any)[condition];
        return conditionData && conditionData['cyclist + pedestrian'];
      });
    });
  }, [allTestResults]);

  const aggregatedStats = useMemo(() => {
    if (allTestResults.length === 0) return null;

    const conditions = ['day_fair', 'day_rain', 'snow', 'night_fair', 'night_rain'];
    const classes = ['vehicle', 'sign', 'human'];
    if (hasCyclistPedestrianData) classes.push('cyclist + pedestrian');

    const aggregated: AggregatedStats = {};

    conditions.forEach(condition => {
      aggregated[condition] = {};
      classes.forEach(className => {
        aggregated[condition][className] = {
          iou: { values: [], mean: 0, std: 0 },
          precision: { values: [], mean: 0, std: 0 },
          recall: { values: [], mean: 0, std: 0 },
          ap: { values: [], mean: 0, std: 0 }
        };
      });
    });

    // Collect all values
    allTestResults.forEach(testResult => {
      conditions.forEach(condition => {
        const conditionData = (testResult.test_results as any)[condition];
        if (!conditionData) return;

        classes.forEach(className => {
          const classData = conditionData[className];
          if (!classData) return;

          if (typeof classData.iou === 'number') aggregated[condition][className].iou.values.push(classData.iou);
          if (typeof classData.precision === 'number') aggregated[condition][className].precision.values.push(classData.precision);
          if (typeof classData.recall === 'number') aggregated[condition][className].recall.values.push(classData.recall);
          if (typeof classData.ap === 'number') aggregated[condition][className].ap.values.push(classData.ap);
        });
      });
    });

    // Calculate mean and std for each metric
    conditions.forEach(condition => {
      classes.forEach(className => {
        (['iou', 'precision', 'recall', 'ap'] as const).forEach(metric => {
          const values = aggregated[condition][className][metric].values;
          if (values.length > 0) {
            const mean = values.reduce((sum: number, val: number) => sum + val, 0) / values.length;
            const variance = values.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const std = Math.sqrt(variance);

            aggregated[condition][className][metric].mean = mean;
            aggregated[condition][className][metric].std = std;
          }
        });
      });
    });

    return aggregated;
  }, [allTestResults, hasCyclistPedestrianData]);

  return { aggregatedStats, hasCyclistPedestrianData };
};