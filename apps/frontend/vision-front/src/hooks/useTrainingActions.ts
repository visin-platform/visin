import { useState } from 'react';
import { Epoch, TestResult } from '../types';
import { epochService } from '../services/epochService';
import { trainingService } from '../services/trainingService';
import { testResultService } from '../services/testResultService';
import { processEpochFiles, processTestResultFiles, UploadResult } from '../utils/fileUploadHelpers';
import { generateLatexCode } from '../utils/latexGenerator';
import { resolveTaxonomyFor, useProjectTaxonomy } from '../taxonomy/useTaxonomy';

interface UseTrainingActionsOptions {
  trainingId: string | undefined;
  refetch: () => void;
  onTrainingDeleted: () => void;
}

export function useTrainingActions({ trainingId, refetch, onTrainingDeleted }: UseTrainingActionsOptions) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Epoch | null>(null);
  const [trainingDeleteOpen, setTrainingDeleteOpen] = useState(false);
  const [uploadResultsOpen, setUploadResultsOpen] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult>({ successful: [], failed: [] });
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');

  const projectTaxonomy = useProjectTaxonomy();

  const handleFileUpload = async (files: FileList, type: 'epoch' | 'testResult') => {
    if (!files || files.length === 0 || !trainingId) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const results = type === 'epoch'
        ? await processEpochFiles(files, trainingId)
        : await processTestResultFiles(files);

      setUploadResults(results);

      if (results.successful.length > 0) {
        setUploadSuccess(`${results.successful.length} file(s) processed successfully`);
        refetch();
      }

      if (results.failed.length > 0) {
        setUploadError(`Failed to process ${results.failed.length} file(s)`);
      }

      setTimeout(() => {
        setUploadSuccess(null);
        setUploadError(null);
      }, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload files';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteClick = (epoch: Epoch) => {
    setDeleteTarget(epoch);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setUploading(true);
      await epochService.deleteEpoch(deleteTarget._id);
      setUploadSuccess('Epoch deleted successfully');
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete epoch';
      setUploadError(message);
    } finally {
      setUploading(false);
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleConfirmDeleteTraining = async () => {
    if (!trainingId) return;

    try {
      setUploading(true);
      await trainingService.deleteTraining(trainingId);
      setUploadSuccess('Training deleted successfully');
      onTrainingDeleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete training';
      setUploadError(message);
    } finally {
      setUploading(false);
      setTrainingDeleteOpen(false);
    }
  };

  const handleDeleteTestResult = async (testResultId: string) => {
    try {
      setUploading(true);
      await testResultService.deleteTestResult(testResultId);
      setUploadSuccess('Test result deleted successfully');
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete test result';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleLatexExport = (testResult: TestResult) => {
    // resolve against this result's own vocabulary, keeping the project's labels
    setLatexCode(generateLatexCode(testResult, resolveTaxonomyFor(projectTaxonomy, [testResult])));
    setLatexModalOpen(true);
  };

  return {
    uploading,
    uploadError,
    uploadSuccess,
    deleteOpen,
    setDeleteOpen,
    deleteTarget,
    trainingDeleteOpen,
    setTrainingDeleteOpen,
    uploadResultsOpen,
    setUploadResultsOpen,
    uploadResults,
    latexModalOpen,
    setLatexModalOpen,
    latexCode,
    handleFileUpload,
    handleDeleteClick,
    handleConfirmDelete,
    handleConfirmDeleteTraining,
    handleDeleteTestResult,
    handleLatexExport
  };
}
