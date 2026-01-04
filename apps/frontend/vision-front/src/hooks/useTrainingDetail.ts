import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trainingService } from '../services/trainingService';
import { configService } from '../services/configService';
import { testResultService } from '../services/testResultService';
import { commentService } from '../services/commentService';
import { TestResult, Comment } from '../types';

export const useTrainingDetail = (id: string | undefined) => {
  const [config, setConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testResultsLoading, setTestResultsLoading] = useState(false);
  const [selectedTestEpoch, setSelectedTestEpoch] = useState<number | null>(null);
  const [allTestResults, setAllTestResults] = useState<TestResult[]>([]);
  const [testResultsMap, setTestResultsMap] = useState<{ [epoch: number]: TestResult[] }>({});
  const [availableTestEpochs, setAvailableTestEpochs] = useState<number[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['training', id],
    queryFn: () => trainingService.getTrainingWithEpochs(id!),
    enabled: !!id
  });

  const training = data?.data?.training;
  const epochs = data?.data?.epochs || [];

  // Fetch config
  useEffect(() => {
    const fetchConfig = async () => {
      if (training?.configId) {
        try {
          setConfigLoading(true);
          const response = await configService.getConfigById(training.configId);
          setConfig(response.data);
        } catch (err) {
          console.error('Failed to fetch config:', err);
          setConfig(null);
        } finally {
          setConfigLoading(false);
        }
      }
    };

    fetchConfig();
  }, [training?.configId]);

  // Fetch test results
  useEffect(() => {
    const fetchTestResultsData = async () => {
      if (!training) return;

      try {
        setTestResultsLoading(true);
        const testResultsResponse = await testResultService.getTestResults({ 
          training_uuid: training.uuid,
          limit: 1000 
        });

        const trainingTestResults = testResultsResponse.data.testResults;
        const testResultsByEpoch: { [epoch: number]: TestResult[] } = {};
        const epochsWithTestResults: number[] = [];

        trainingTestResults.forEach((testResult: TestResult) => {
          const epochNumber = testResult.epoch;
          if (!testResultsByEpoch[epochNumber]) {
            testResultsByEpoch[epochNumber] = [];
            epochsWithTestResults.push(epochNumber);
          }
          testResultsByEpoch[epochNumber].push(testResult);
        });

        setAvailableTestEpochs(epochsWithTestResults.sort((a, b) => a - b));
        setTestResultsMap(testResultsByEpoch);
        setAllTestResults(trainingTestResults);

        // Auto-select epoch logic
        let epochToSelect = selectedTestEpoch;
        if (!selectedTestEpoch && epochsWithTestResults.length > 0) {
          epochToSelect = epochsWithTestResults[0];
        } else if (selectedTestEpoch && !epochsWithTestResults.includes(selectedTestEpoch)) {
          epochToSelect = epochsWithTestResults.length > 0 ? epochsWithTestResults[0] : null;
        }

        if (epochToSelect && testResultsByEpoch[epochToSelect]) {
          setTestResults(testResultsByEpoch[epochToSelect]);
          setSelectedTestEpoch(epochToSelect);
        } else {
          setTestResults([]);
          setSelectedTestEpoch(null);
        }
      } catch (err) {
        console.error('Failed to fetch test results data:', err);
        setTestResults([]);
        setAvailableTestEpochs([]);
        setSelectedTestEpoch(null);
      } finally {
        setTestResultsLoading(false);
      }
    };

    fetchTestResultsData();
  }, [training, epochs]); // Re-fetch when training or epochs change

  // Update test results when selected epoch changes
  useEffect(() => {
    if (selectedTestEpoch && testResultsMap[selectedTestEpoch]) {
      setTestResults(testResultsMap[selectedTestEpoch]);
    } else {
      setTestResults([]);
    }
  }, [selectedTestEpoch, testResultsMap]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (!training) return;

    try {
      setCommentsLoading(true);
      const commentsResponse = await commentService.getCommentsByTraining(training._id, undefined, { limit: 1000 });
      setComments(commentsResponse.data.comments || []);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [training]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

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
    availableTestEpochs,
    comments,
    commentsLoading,
    refetchComments: fetchComments
  };
};
