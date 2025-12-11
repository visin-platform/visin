import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import TestResult from '../models/TestResult';
import Epoch from '../models/Epoch';
import Training from '../models/Training';

// Get all test results
export const getTestResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy = 'timestamp', order = 'desc', epoch, epoch_uuids, training_uuid, projectId } = req.query;

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy as string;

    let query = TestResult.find({ deletedAt: null });

    // Filter by projectId if provided
    if (projectId) {
      // Find all trainings for this project
      const trainings = await Training.find({ projectId: projectId as string, deletedAt: null });
      if (trainings.length === 0) {
        // No trainings found, return empty result
        res.json({
          success: true,
          data: {
            testResults: [],
            total: 0,
            pagination: {
              page: Number(page) || 1,
              limit: Number(limit) || 10,
              total: 0,
              totalPages: 0
            }
          }
        });
        return;
      }

      // Get all epochs for these trainings
      const trainingIds = trainings.map(t => t._id.toString());
      const trainingEpochs = await Epoch.find({ trainingId: { $in: trainingIds } }, 'epoch_uuid');
      const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);

      if (trainingEpochUuids.length === 0) {
        // No epochs found, return empty result
        res.json({
          success: true,
          data: {
            testResults: [],
            total: 0,
            pagination: {
              page: Number(page) || 1,
              limit: Number(limit) || 10,
              total: 0,
              totalPages: 0
            }
          }
        });
        return;
      }

      // Filter by the epoch UUIDs of this project's trainings
      query = query.where('epoch_uuid').in(trainingEpochUuids);
    }

    // Filter by training_uuid if provided
    if (training_uuid) {
      // Find the training by UUID
      const training = await Training.findOne({ uuid: training_uuid as string });
      if (!training) {
        res.status(404).json({
          success: false,
          message: 'Training not found'
        });
        return;
      }

      // Get all epochs for this training
      const trainingEpochs = await Epoch.find({ trainingId: training._id.toString() }, 'epoch_uuid');
      const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);

      if (trainingEpochUuids.length === 0) {
        // No epochs found, return empty result
        res.json({
          success: true,
          data: {
            testResults: [],
            total: 0
          }
        });
        return;
      }

      // Filter by the epoch UUIDs of this training
      query = query.where('epoch_uuid').in(trainingEpochUuids);
    }

    // Filter by epoch if provided
    if (epoch !== undefined) {
      query = query.where('epoch').equals(Number(epoch));
    }

    // Filter by epoch_uuids if provided (comma-separated)
    if (epoch_uuids) {
      const uuids = (epoch_uuids as string).split(',').map(uuid => uuid.trim());
      query = query.where('epoch_uuid').in(uuids);
    }

    query = query.sort({ [sortField]: sortOrder });

    // If pagination is provided
    if (page && limit) {
      const skip = (Number(page) - 1) * Number(limit);
      query = query.skip(skip).limit(Number(limit));

      // Build count query based on filters
      let countQuery: any = { deletedAt: null };
      if (projectId) {
        const trainings = await Training.find({ projectId: projectId as string, deletedAt: null });
        if (trainings.length > 0) {
          const trainingIds = trainings.map(t => t._id.toString());
          const trainingEpochs = await Epoch.find({ trainingId: { $in: trainingIds } }, 'epoch_uuid');
          const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);
          countQuery.epoch_uuid = { $in: trainingEpochUuids };
        } else {
          countQuery.epoch_uuid = { $in: [] }; // No epochs
        }
      } else if (training_uuid) {
        const training = await Training.findOne({ uuid: training_uuid as string, deletedAt: null });
        if (training) {
          const trainingEpochs = await Epoch.find({ trainingId: training._id.toString() }, 'epoch_uuid');
          const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);
          countQuery.epoch_uuid = { $in: trainingEpochUuids };
        }
      } else if (epoch !== undefined) {
        countQuery.epoch = Number(epoch);
      } else if (epoch_uuids) {
        countQuery.epoch_uuid = { $in: (epoch_uuids as string).split(',').map(uuid => uuid.trim()) };
      }

      const [testResults, total] = await Promise.all([
        query,
        TestResult.countDocuments(countQuery)
      ]);

      // Get training information for the test results
      const epochUuids = testResults.map(tr => tr.epoch_uuid);
      const epochs = await Epoch.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });
      const trainingIds = epochs.map(e => e.trainingId);
      const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

      // Create lookup maps
      const epochMap = epochs.reduce((acc, epoch) => {
        acc[epoch.epoch_uuid] = epoch;
        return acc;
      }, {} as Record<string, any>);

      const trainingMap = trainings.reduce((acc, training) => {
        acc[(training._id as any).toString()] = training;
        return acc;
      }, {} as Record<string, any>);

      // Filter test results to only include those with valid epochs and trainings
      const validEpochUuids = new Set(epochs.map(e => e.epoch_uuid));
      const validTrainingIds = new Set(trainings.map(t => (t._id as any).toString()));
      
      const filteredTestResults = testResults.filter(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        if (!epoch) return false;
        const training = trainingMap[epoch.trainingId.toString()];
        return training !== undefined;
      });

      // Add training info to test results
      const testResultsWithTraining = filteredTestResults.map(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;

        return {
          ...testResult.toObject(),
          training: training ? {
            _id: training._id,
            name: training.name,
            uuid: training.uuid,
            status: training.status
          } : null,
          epoch_info: epoch ? {
            epoch: epoch.epoch,
            epoch_time: epoch.epoch_time
          } : null
        };
      });

      // Update total count to reflect filtered results
      const actualTotal = filteredTestResults.length;

      res.json({
        success: true,
        data: {
          testResults: testResultsWithTraining,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: actualTotal,
            pages: Math.ceil(actualTotal / Number(limit))
          }
        }
      });
    } else {
      // Return all test results without pagination
      const testResults = await query;

      // Get training information for the test results
      const epochUuids = testResults.map(tr => tr.epoch_uuid);
      const epochs = await Epoch.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });
      const trainingIds = epochs.map(e => e.trainingId);
      const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

      // Create lookup maps
      const epochMap = epochs.reduce((acc, epoch) => {
        acc[epoch.epoch_uuid] = epoch;
        return acc;
      }, {} as Record<string, any>);

      const trainingMap = trainings.reduce((acc, training) => {
        acc[(training._id as any).toString()] = training;
        return acc;
      }, {} as Record<string, any>);

      // Filter test results to only include those with valid epochs and trainings
      const filteredTestResults = testResults.filter(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        if (!epoch) return false;
        const training = trainingMap[epoch.trainingId.toString()];
        return training !== undefined;
      });

      // Add training info to test results
      const testResultsWithTraining = filteredTestResults.map(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;

        return {
          ...testResult.toObject(),
          training: training ? {
            _id: training._id,
            name: training.name,
            uuid: training.uuid,
            status: training.status
          } : null,
          epoch_info: epoch ? {
            epoch: epoch.epoch,
            epoch_time: epoch.epoch_time
          } : null
        };
      });

      res.json({
        success: true,
        data: {
          testResults: testResultsWithTraining,
          total: filteredTestResults.length
        }
      });
    }
  } catch (error) {
    console.error('Error fetching test results:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test results'
    });
  }
};

// Get test result by ID
export const getTestResultById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });

    if (!testResult) {
      res.status(404).json({
        success: false,
        message: 'Test result not found'
      });
      return;
    }

    res.json({
      success: true,
      data: testResult
    });
  } catch (error) {
    console.error('Error fetching test result:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test result'
    });
  }
};

// Get test result by test UUID
export const getTestResultByTestUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const { testUuid } = req.params;

    const testResult = await TestResult.findOne({ test_uuid: testUuid, deletedAt: null });

    if (!testResult) {
      res.status(404).json({
        success: false,
        message: 'Test result not found'
      });
      return;
    }

    res.json({
      success: true,
      data: testResult
    });
  } catch (error) {
    console.error('Error fetching test result:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test result'
    });
  }
};

// Get test results by epoch UUID
export const getTestResultsByEpochUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const { epochUuid } = req.params;
    const { page, limit, sortBy = 'timestamp', order = 'desc' } = req.query;

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy as string;

    let query = TestResult.find({ epoch_uuid: epochUuid, deletedAt: null }).sort({ [sortField]: sortOrder });

    // If pagination is provided
    if (page && limit) {
      const skip = (Number(page) - 1) * Number(limit);
      query = query.skip(skip).limit(Number(limit));

      const [testResults, total] = await Promise.all([
        query,
        TestResult.countDocuments({ epoch_uuid: epochUuid, deletedAt: null })
      ]);

      // Get training information for the test results
      const epochs = await Epoch.find({ epoch_uuid: epochUuid, deletedAt: null });
      const trainingIds = epochs.map(e => e.trainingId);
      const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

      // Create lookup maps
      const epochMap = epochs.reduce((acc, epoch) => {
        acc[epoch.epoch_uuid] = epoch;
        return acc;
      }, {} as Record<string, any>);

      const trainingMap = trainings.reduce((acc, training) => {
        acc[(training._id as any).toString()] = training;
        return acc;
      }, {} as Record<string, any>);

      // Filter test results to only include those with valid epochs and trainings
      const filteredTestResults = testResults.filter(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        if (!epoch) return false;
        const training = trainingMap[epoch.trainingId.toString()];
        return training !== undefined;
      });

      // Add training info to test results
      const testResultsWithTraining = filteredTestResults.map(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;

        return {
          ...testResult.toObject(),
          training: training ? {
            _id: training._id,
            name: training.name,
            uuid: training.uuid,
            status: training.status
          } : null,
          epoch_info: epoch ? {
            epoch: epoch.epoch,
            epoch_time: epoch.epoch_time
          } : null
        };
      });

      // Update total count to reflect filtered results
      const actualTotal = filteredTestResults.length;

      res.json({
        success: true,
        data: {
          testResults: testResultsWithTraining,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: actualTotal,
            pages: Math.ceil(actualTotal / Number(limit))
          }
        }
      });
    } else {
      // Return all test results without pagination
      const testResults = await query;

      // Get training information for the test results
      const epochs = await Epoch.find({ epoch_uuid: epochUuid, deletedAt: null });
      const trainingIds = epochs.map(e => e.trainingId);
      const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

      // Create lookup maps
      const epochMap = epochs.reduce((acc, epoch) => {
        acc[epoch.epoch_uuid] = epoch;
        return acc;
      }, {} as Record<string, any>);

      const trainingMap = trainings.reduce((acc, training) => {
        acc[(training._id as any).toString()] = training;
        return acc;
      }, {} as Record<string, any>);

      // Filter test results to only include those with valid epochs and trainings
      const filteredTestResults = testResults.filter(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        if (!epoch) return false;
        const training = trainingMap[epoch.trainingId.toString()];
        return training !== undefined;
      });

      // Add training info to test results
      const testResultsWithTraining = filteredTestResults.map(testResult => {
        const epoch = epochMap[testResult.epoch_uuid];
        const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;

        return {
          ...testResult.toObject(),
          training: training ? {
            _id: training._id,
            name: training.name,
            uuid: training.uuid,
            status: training.status
          } : null,
          epoch_info: epoch ? {
            epoch: epoch.epoch,
            epoch_time: epoch.epoch_time
          } : null
        };
      });

      res.json({
        success: true,
        data: {
          testResults: testResultsWithTraining,
          total: filteredTestResults.length
        }
      });
    }
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
    const {
      timestamp,
      epoch,
      epoch_uuid,
      test_uuid,
      test_results
    } = req.body;

    if (epoch === undefined || epoch === null) {
      res.status(400).json({
        success: false,
        message: 'Epoch number is required'
      });
      return;
    }

    if (!epoch_uuid) {
      res.status(400).json({
        success: false,
        message: 'Epoch UUID is required'
      });
      return;
    }

    if (!test_results) {
      res.status(400).json({
        success: false,
        message: 'Test results are required'
      });
      return;
    }

    // Check if test result already exists
    if (test_uuid) {
      const existingTestResult = await TestResult.findOne({ test_uuid });
      if (existingTestResult) {
        res.status(409).json({
          success: false,
          message: `Test result with test_uuid ${test_uuid} already exists`
        });
        return;
      }
    }

    const testResultData = new TestResult({
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      epoch,
      epoch_uuid,
      test_uuid: test_uuid || uuidv4(),
      test_results
    });

    const savedTestResult = await testResultData.save();

    // Update epoch and training timestamps
    try {
      const epoch = await Epoch.findOne({ epoch_uuid });
      if (epoch) {
        await Epoch.findByIdAndUpdate(epoch._id, { updatedAt: new Date() });
        
        // Update training timestamp
        await Training.findByIdAndUpdate(epoch.trainingId, { updatedAt: new Date() });
      }
    } catch (updateError) {
      console.warn('Failed to update epoch/training timestamps:', updateError);
      // Don't fail the request if timestamp update fails
    }

    res.status(201).json({
      success: true,
      message: 'Test result created successfully',
      data: savedTestResult
    });
  } catch (error) {
    console.error('Error creating test result:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test result'
    });
  }
};

// Create test result from JSON (accepts the full JSON structure)
export const createTestResultFromJson = async (req: Request, res: Response): Promise<void> => {
  try {
    const jsonData = req.body;

    // Validate required fields
    if (!jsonData.test_results) {
      res.status(400).json({
        success: false,
        message: 'test_results field is required'
      });
      return;
    }

    if (jsonData.epoch === undefined || jsonData.epoch === null) {
      res.status(400).json({
        success: false,
        message: 'epoch field is required'
      });
      return;
    }

    if (!jsonData.epoch_uuid) {
      res.status(400).json({
        success: false,
        message: 'epoch_uuid field is required'
      });
      return;
    }

    // Check if test result already exists
    if (jsonData.test_uuid) {
      const existingTestResult = await TestResult.findOne({ test_uuid: jsonData.test_uuid });
      if (existingTestResult) {
        res.status(409).json({
          success: false,
          message: `Test result with test_uuid ${jsonData.test_uuid} already exists`
        });
        return;
      }
    }

    const testResultData = new TestResult({
      timestamp: jsonData.timestamp ? new Date(jsonData.timestamp) : new Date(),
      epoch: jsonData.epoch,
      epoch_uuid: jsonData.epoch_uuid,
      test_uuid: jsonData.test_uuid || uuidv4(),
      test_results: jsonData.test_results
    });

    const savedTestResult = await testResultData.save();

    // Update epoch and training timestamps
    try {
      const epoch = await Epoch.findOne({ epoch_uuid: jsonData.epoch_uuid });
      if (epoch) {
        await Epoch.findByIdAndUpdate(epoch._id, { updatedAt: new Date() });
        
        // Update training timestamp
        await Training.findByIdAndUpdate(epoch.trainingId, { updatedAt: new Date() });
      }
    } catch (updateError) {
      console.warn('Failed to update epoch/training timestamps:', updateError);
      // Don't fail the request if timestamp update fails
    }

    res.status(201).json({
      success: true,
      message: 'Test result created successfully',
      data: savedTestResult
    });
  } catch (error) {
    console.error('Error creating test result from JSON:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test result'
    });
  }
};

// Update test result
export const updateTestResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      timestamp,
      epoch,
      epoch_uuid,
      test_results
    } = req.body;

    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });

    if (!testResult) {
      res.status(404).json({
        success: false,
        message: 'Test result not found'
      });
      return;
    }

    // Update fields
    if (timestamp !== undefined) testResult.timestamp = new Date(timestamp);
    if (epoch !== undefined) testResult.epoch = epoch;
    if (epoch_uuid !== undefined) testResult.epoch_uuid = epoch_uuid;
    if (test_results !== undefined) testResult.test_results = test_results;

    const updatedTestResult = await testResult.save();

    // Update epoch and training timestamps
    try {
      const currentEpochUuid = epoch_uuid !== undefined ? epoch_uuid : testResult.epoch_uuid;
      const epoch = await Epoch.findOne({ epoch_uuid: currentEpochUuid });
      if (epoch) {
        await Epoch.findByIdAndUpdate(epoch._id, { updatedAt: new Date() });
        
        // Update training timestamp
        await Training.findByIdAndUpdate(epoch.trainingId, { updatedAt: new Date() });
      }
    } catch (updateError) {
      console.warn('Failed to update epoch/training timestamps:', updateError);
      // Don't fail the request if timestamp update fails
    }

    res.json({
      success: true,
      message: 'Test result updated successfully',
      data: updatedTestResult
    });
  } catch (error) {
    console.error('Error updating test result:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update test result'
    });
  }
};

// Delete test result
export const deleteTestResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });

    if (!testResult) {
      res.status(404).json({
        success: false,
        message: 'Test result not found'
      });
      return;
    }

    testResult.deletedAt = new Date();
    await testResult.save();

    res.json({
      success: true,
      message: 'Test result deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting test result:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete test result'
    });
  }
};

// Get unique epochs that have test results
export const getTestResultEpochs = async (req: Request, res: Response): Promise<void> => {
  try {
    const epochs = await TestResult.distinct('epoch').sort();

    res.json({
      success: true,
      data: {
        epochs
      }
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

    if (testResultIds.length > 10) {
      res.status(400).json({
        success: false,
        message: 'Maximum 10 test results can be compared at once'
      });
      return;
    }

    // Fetch test results
    const testResults = await TestResult.find({ _id: { $in: testResultIds }, deletedAt: null });

    // Get associated epochs and trainings for additional context
    const epochUuids = testResults.map(tr => tr.epoch_uuid);
    const epochs = await Epoch.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });
    const trainingIds = epochs.map(e => e.trainingId);
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

    // Create lookup maps
    const epochMap = epochs.reduce((acc, epoch) => {
      acc[epoch.epoch_uuid] = epoch;
      return acc;
    }, {} as Record<string, any>);

    const trainingMap = trainings.reduce((acc, training) => {
      acc[(training._id as any).toString()] = training;
      return acc;
    }, {} as Record<string, any>);

    // Calculate comparison data for each test result
    const comparisonData = testResults.map(testResult => {
      const epoch = epochMap[testResult.epoch_uuid];
      const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;

      // Filter out inference_time from test_results before sending to frontend
      const filteredTestResults: any = {};
      Object.keys(testResult.test_results).forEach(condition => {
        if (condition !== 'inference_time') {
          filteredTestResults[condition] = {};
          Object.keys(testResult.test_results[condition]).forEach(className => {
            if (className !== 'inference_time' && !className.startsWith('mean_')) {
              filteredTestResults[condition][className] = testResult.test_results[condition][className];
            }
          });
        }
      });

      return {
        testResult: {
          _id: testResult._id,
          test_uuid: testResult.test_uuid,
          epoch: testResult.epoch,
          epoch_uuid: testResult.epoch_uuid,
          timestamp: testResult.timestamp,
          createdAt: testResult.createdAt,
          updatedAt: testResult.updatedAt
        },
        training: training ? {
          _id: training._id,
          name: training.name,
          uuid: training.uuid,
          status: training.status
        } : null,
        epoch: epoch ? {
          epoch: epoch.epoch,
          epoch_time: epoch.epoch_time,
          results: epoch.results
        } : null,
        test_results: filteredTestResults
      };
    });

    res.json({
      success: true,
      data: {
        comparison: comparisonData,
        summary: {
          totalTestResults: testResults.length,
          conditions: Object.keys(testResults[0]?.test_results || {}).filter(condition => condition !== 'inference_time'),
          classes: (() => {
            const allClasses = new Set<string>();
            comparisonData.forEach(comp => {
              Object.values(comp.test_results).forEach((conditionData: any) => {
                if (conditionData && typeof conditionData === 'object') {
                  Object.keys(conditionData).forEach(className => {
                    if (className !== 'inference_time' && !className.startsWith('mean_')) {
                      allClasses.add(className);
                    }
                  });
                }
              });
            });
            return Array.from(allClasses).sort();
          })()
        }
      }
    });
  } catch (error) {
    console.error('Error comparing test results:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to compare test results';
    res.status(500).json({
      success: false,
      message: 'Failed to compare test results',
      error: errorMessage
    });
  }
};