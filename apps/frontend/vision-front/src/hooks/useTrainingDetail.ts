import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trainingService } from '../services/trainingService';
import { configService } from '../services/configService';
import { runEvaluationService } from '../services/runEvaluationService';
import { RunEvaluation } from '../types';

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
    data: evaluationsResponse,
    isLoading: evaluationsLoading,
    refetch: refetchEvaluations
  } = useQuery({
    queryKey: ['evaluations', training?.uuid],
    queryFn: () =>
      runEvaluationService.list({
        training_uuid: training!.uuid,
        limit: 1000
      }),
    enabled: !!training?.uuid
  });

  const allEvaluations = useMemo(
    () => evaluationsResponse?.data.evaluations ?? [],
    [evaluationsResponse?.data.evaluations]
  );

  const { evaluationsMap, availableEpochs } = useMemo(() => {
    const resultsByEpoch: { [epoch: number]: RunEvaluation[] } = {};
    const epochsWithResults: number[] = [];

    allEvaluations.forEach((evaluation: RunEvaluation) => {
      const epochNumber = evaluation.epoch;
      if (!resultsByEpoch[epochNumber]) {
        resultsByEpoch[epochNumber] = [];
        epochsWithResults.push(epochNumber);
      }
      resultsByEpoch[epochNumber].push(evaluation);
    });

    return {
      evaluationsMap: resultsByEpoch,
      availableEpochs: epochsWithResults.sort((a, b) => a - b)
    };
  }, [allEvaluations]);

  // Update test results when selected epoch changes
  useEffect(() => {
    setSelectedTestEpoch((currentEpoch) =>
      currentEpoch && availableEpochs.includes(currentEpoch)
        ? currentEpoch
        : availableEpochs[0] ?? null
    );
  }, [availableEpochs]);

  const evaluations = selectedTestEpoch ? evaluationsMap[selectedTestEpoch] ?? [] : [];

  const refetch = useCallback(() => {
    refetchTraining();
    refetchEvaluations();
  }, [refetchTraining, refetchEvaluations]);

  return {
    training,
    epochs,
    isLoading,
    error,
    refetch,
    config,
    configLoading,
    evaluations,
    allEvaluations,
    evaluationsLoading,
    selectedTestEpoch,
    setSelectedTestEpoch,
    availableEpochs
  };
};
