import { useCallback } from 'react';
import { generateAggregatedLatexCode, AggregatedStats } from '../utils/latexGenerator';

interface ComparisonData {
  aggregatedResults: AggregatedStats;
  training: { _id: string; name: string };
  testResultsCount: number;
}

export const useLatexGenerator = (comparisonData: ComparisonData[]) => {

  const generateLatexTable = useCallback(() => {
    if (!comparisonData.length) return '';

    // Always use aggregated comparison logic
    const aggregatedStats = comparisonData[0].aggregatedResults;
    const testResultsCount = comparisonData[0].testResultsCount || 0;
    
    // Check if we have cyclist + pedestrian data
    const hasCyclistPedestrianData = Object.values(aggregatedStats || {}).some((conditionData) => 
      conditionData && conditionData['cyclist + pedestrian']
    );

    return generateAggregatedLatexCode(aggregatedStats, hasCyclistPedestrianData, testResultsCount);
  }, [comparisonData]);

  const generatePerformanceLatexTable = useCallback(() => {
    if (!comparisonData.length) return '';

    // Use aggregated comparison logic
    const aggregatedStats = comparisonData[0].aggregatedResults;
    const testResultsCount = comparisonData[0].testResultsCount || 0;
    
    // Check if we have cyclist + pedestrian data
    const hasCyclistPedestrianData = Object.values(aggregatedStats || {}).some((conditionData) => 
      conditionData && conditionData['cyclist + pedestrian']
    );

    return generateAggregatedLatexCode(aggregatedStats, hasCyclistPedestrianData, testResultsCount);
  }, [comparisonData]);

  const generatePerClassLatexTable = useCallback(() => {
    if (!comparisonData.length) return '';

    // Use aggregated comparison logic
    const aggregatedStats = comparisonData[0].aggregatedResults;
    const testResultsCount = comparisonData[0].testResultsCount || 0;
    
    // Check if we have cyclist + pedestrian data
    const hasCyclistPedestrianData = Object.values(aggregatedStats || {}).some((conditionData) => 
      conditionData && conditionData['cyclist + pedestrian']
    );

    return generateAggregatedLatexCode(aggregatedStats, hasCyclistPedestrianData, testResultsCount);
  }, [comparisonData]);

  return {
    generateLatexTable,
    generatePerformanceLatexTable,
    generatePerClassLatexTable
  };
};