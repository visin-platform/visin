import { Request, Response } from 'express';
import { testResultService } from '../services/testResultService';
import type { GetTestResultsQuery, GetTestResultsByEpochUuidQuery } from '../validation/testResultSchemas';

// Get all test results
export const getTestResults = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, order, epoch, epoch_uuids, training_uuid, projectId } =
    req.query as unknown as GetTestResultsQuery;

  const result = await testResultService.getTestResults(
    req.user?.id,
    { epoch, epoch_uuids, training_uuid, projectId },
    { page, limit, sortBy, order }
  );

  res.json({
    success: true,
    data: result
  });
};

// Get test result by ID
export const getTestResultById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const testResult = await testResultService.getTestResultById(id, req.user?.id);
  res.json({
    success: true,
    data: testResult
  });
};

// Get test result by test UUID
export const getTestResultByTestUuid = async (req: Request, res: Response): Promise<void> => {
  const testUuid = req.params.testUuid as string;
  const testResult = await testResultService.getTestResultByTestUuid(testUuid, req.user?.id);
  res.json({
    success: true,
    data: testResult
  });
};

// Get test results by epoch UUID
export const getTestResultsByEpochUuid = async (req: Request, res: Response): Promise<void> => {
  const epochUuid = req.params.epochUuid as string;
  const pagination = req.query as unknown as GetTestResultsByEpochUuidQuery;

  const result = await testResultService.getTestResultsByEpochUuid(epochUuid, req.user?.id, pagination);

  res.json({
    success: true,
    data: result
  });
};

// Create test result
export const createTestResult = async (req: Request, res: Response): Promise<void> => {
  const result = await testResultService.createTestResult(req.user?.id, req.projectId, req.body);
  res.status(201).json({
    success: true,
    message: 'Test result created successfully',
    data: result
  });
};

// Create test result from JSON
export const createTestResultFromJson = async (req: Request, res: Response): Promise<void> => {
  // The service expects the same structure, so we can reuse createTestResult
  const result = await testResultService.createTestResult(req.user?.id, req.projectId, req.body);
  res.status(201).json({
    success: true,
    message: 'Test result created successfully',
    data: result
  });
};

// Update test result
export const updateTestResult = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const result = await testResultService.updateTestResult(id, req.user?.id, req.projectId, req.body);
  res.json({
    success: true,
    message: 'Test result updated successfully',
    data: result
  });
};

// Delete test result
export const deleteTestResult = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  await testResultService.deleteTestResult(id, req.user?.id, req.projectId);
  res.json({
    success: true,
    message: 'Test result deleted successfully'
  });
};

// Get unique epochs that have test results
export const getTestResultEpochs = async (req: Request, res: Response): Promise<void> => {
  const epochs = await testResultService.getTestResultEpochs(req.user?.id);
  res.json({
    success: true,
    data: { epochs }
  });
};

// Compare test results
export const compareTestResults = async (req: Request, res: Response): Promise<void> => {
  const { testResultIds } = req.body;
  const result = await testResultService.compareTestResults(req.user?.id, testResultIds);
  res.json({
    success: true,
    data: result
  });
};

// Compare aggregated test results by training
export const compareAggregatedTestResultsByTraining = async (req: Request, res: Response): Promise<void> => {
  const { trainingIds } = req.body;
  const result = await testResultService.getAggregatedTestResultsByTraining(req.user?.id, trainingIds);
  res.json({
    success: true,
    data: result
  });
};
