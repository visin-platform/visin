import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trainingService } from '../services/trainingService';
import { configService } from '../services/configService';
import { testResultService } from '../services/testResultService';
import { TestResult } from '../types';

export const useTrainingDetail = (id: string | undefined) => {
  const [selectedTestEpoch, setSelectedTestEpoch] = useState<number | null>(null);

  const { data, isLoading, error, refetch: refetchTraining } = useQuery({
    queryKey: ['training', id],
    queryFn: () => trainingService.getTrainingWithEpochs(id!),
    enabled: !!id
  });

  const training = data?.data?.training;
  const epochs = data?.data?.epochs || [];

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['config', training?.configId],
    queryFn: () => configService.getConfigById(training!.configId!),
    enabled: !!training?.configId
  });
  const config = configData?.data ?? null;

  const {
    data: testResultsResponse,
    isLoading: testResultsLoading,
    refetch: refetchTestResults
  } = useQuery({
    queryKey: ['testResults', training?.uuid],
    queryFn: () =>
      testResultService.getTestResults({
        training_uuid: training!.uuid,
        limit: 1000
      }),
    enabled: !!training?.uuid
  });

  const allTestResults = useMemo(
    () => testResultsResponse?.data.testResults ?? [],
    [testResultsResponse?.data.testResults]
  );

  const { testResultsMap, availableTestEpochs } = useMemo(() => {
    const resultsByEpoch: { [epoch: number]: TestResult[] } = {};
    const epochsWithResults: number[] = [];

    allTestResults.forEach((testResult: TestResult) => {
      const epochNumber = testResult.epoch;
      if (!resultsByEpoch[epochNumber]) {
        resultsByEpoch[epochNumber] = [];
        epochsWithResults.push(epochNumber);
      }
      resultsByEpoch[epochNumber].push(testResult);
    });

    return {
      testResultsMap: resultsByEpoch,
      availableTestEpochs: epochsWithResults.sort((a, b) => a - b)
    };
  }, [allTestResults]);

  // Update test results when selected epoch changes
  useEffect(() => {
    setSelectedTestEpoch((currentEpoch) =>
      currentEpoch && availableTestEpochs.includes(currentEpoch)
        ? currentEpoch
        : availableTestEpochs[0] ?? null
    );
  }, [availableTestEpochs]);

  const testResults = selectedTestEpoch ? testResultsMap[selectedTestEpoch] ?? [] : [];

  const refetch = useCallback(() => {
    refetchTraining();
    refetchTestResults();
  }, [refetchTraining, refetchTestResults]);

  return {
    training,
    epochs,
    isLoading,
    error,
    refetch,
    config,
    configLoading,
    testResults,
    allTestResults,
    testResultsLoading,
    selectedTestEpoch,
    setSelectedTestEpoch,
    availableTestEpochs
  };
};
