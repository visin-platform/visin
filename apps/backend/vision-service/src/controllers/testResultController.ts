import { Request, Response } from 'express';
import { testResultService } from '../services/testResultService';

// Get all test results
export const getTestResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy, order, epoch, epoch_uuids, training_uuid, projectId } = req.query;

    const filters = {
      epoch: epoch !== undefined ? Number(epoch) : undefined,
      epoch_uuids: epoch_uuids ? (epoch_uuids as string).split(',').map(uuid => uuid.trim()) : undefined,
      training_uuid: training_uuid as string,
      projectId: projectId as string
    };

    const pagination = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy: sortBy as string,
      order: order as 'asc' | 'desc'
    };

    const result = await testResultService.getTestResults(filters, pagination);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching test results:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch test results'
    });
  }
};

// Get test result by ID
export const getTestResultById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const testResult = await testResultService.getTestResultById(id);
    res.json({
      success: true,
      data: testResult
    });
  } catch (error) {
    console.error('Error fetching test result:', error);
    if (error instanceof Error && error.message === 'Test result not found') {
      res.status(404).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Failed to fetch test result' });
    }
  }
};

// Get test result by test UUID
export const getTestResultByTestUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const testUuid = req.params.testUuid as string;
    const testResult = await testResultService.getTestResultByTestUuid(testUuid);
    res.json({
      success: true,
      data: testResult
    });
  } catch (error) {
    console.error('Error fetching test result:', error);
    if (error instanceof Error && error.message === 'Test result not found') {
      res.status(404).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Failed to fetch test result' });
    }
  }
};

// Get test results by epoch UUID
export const getTestResultsByEpochUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const epochUuid = req.params.epochUuid as string;
    const { page, limit, sortBy, order } = req.query;

    const pagination = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy: sortBy as string,
      order: order as 'asc' | 'desc'
    };

    const result = await testResultService.getTestResultsByEpochUuid(epochUuid, pagination);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching test results by epoch UUID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test results'
    });
  }
};

// Create test result
export const createTestResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await testResultService.createTestResult(req.body);
    res.status(201).json({
      success: true,
      message: 'Test result created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating test result:', error);
    if (error instanceof Error) {
      if (error.message.includes('exists')) {
        res.status(409).json({ success: false, message: error.message });
        return;
      }
      if (error.message.includes('required')) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
    }
    res.status(500).json({ success: false, message: 'Failed to create test result' });
  }
};

// Create test result from JSON
export const createTestResultFromJson = async (req: Request, res: Response): Promise<void> => {
  try {
    // The service expects the same structure, so we can reuse createTestResult
    const result = await testResultService.createTestResult(req.body);
    res.status(201).json({
      success: true,
      message: 'Test result created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating test result from JSON:', error);
    if (error instanceof Error) {
      if (error.message.includes('exists')) {
        res.status(409).json({ success: false, message: error.message });
        return;
      }
      if (error.message.includes('required')) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
    }
    res.status(500).json({ success: false, message: 'Failed to create test result' });
  }
};

// Update test result
export const updateTestResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const result = await testResultService.updateTestResult(id, req.body);
    res.json({
      success: true,
      message: 'Test result updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating test result:', error);
    if (error instanceof Error && error.message === 'Test result not found') {
      res.status(404).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Failed to update test result' });
    }
  }
};

// Delete test result
export const deleteTestResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await testResultService.deleteTestResult(id);
    res.json({
      success: true,
      message: 'Test result deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting test result:', error);
    if (error instanceof Error && error.message === 'Test result not found') {
      res.status(404).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Failed to delete test result' });
    }
  }
};

// Get unique epochs that have test results
export const getTestResultEpochs = async (req: Request, res: Response): Promise<void> => {
  try {
    const epochs = await testResultService.getTestResultEpochs();
    res.json({
      success: true,
      data: { epochs }
    });
  } catch (error) {
    console.error('Error fetching test result epochs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test result epochs'
    });
  }
};

// Compare test results
export const compareTestResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { testResultIds } = req.body;
    if (!testResultIds || !Array.isArray(testResultIds) || testResultIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Test result IDs array is required'
      });
      return;
    }

    const result = await testResultService.compareTestResults(testResultIds);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error comparing test results:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compare test results',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Compare aggregated test results by training
export const compareAggregatedTestResultsByTraining = async (req: Request, res: Response): Promise<void> => {
  try {
    const { trainingIds } = req.body;
    if (!trainingIds || !Array.isArray(trainingIds) || trainingIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Training IDs array is required'
      });
      return;
    }

    const result = await testResultService.getAggregatedTestResultsByTraining(trainingIds);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error comparing aggregated test results by training:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compare aggregated test results by training',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
