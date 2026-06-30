import { randomUUID as uuidv4 } from 'crypto';
import TestResult from '../models/TestResult';
import Epoch from '../models/Epoch';
import Training from '../models/Training';

interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

interface TestResultFilters {
  epoch?: number;
  epoch_uuids?: string[];
  training_uuid?: string;
  projectId?: string;
}

export const testResultService = {
  async getTestResults(filters: TestResultFilters, pagination: PaginationOptions) {
    const { page, limit, sortBy = 'timestamp', order = 'desc' } = pagination;
    const { epoch, epoch_uuids, training_uuid, projectId } = filters;

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy;

    let query = TestResult.find({ deletedAt: null });

    // Filter by projectId if provided
    if (projectId) {
      const trainings = await Training.find({ projectId, deletedAt: null });
      if (trainings.length === 0) {
        return { testResults: [], total: 0, pagination: { page: page || 1, limit: limit || 10, total: 0, totalPages: 0 } };
      }

      const trainingIds = trainings.map(t => t._id.toString());
      const trainingEpochs = await Epoch.find({ trainingId: { $in: trainingIds } }, 'epoch_uuid');
      const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);

      if (trainingEpochUuids.length === 0) {
        return { testResults: [], total: 0, pagination: { page: page || 1, limit: limit || 10, total: 0, totalPages: 0 } };
      }

      query = query.where('epoch_uuid').in(trainingEpochUuids);
    }

    // Filter by training_uuid if provided
    if (training_uuid) {
      const training = await Training.findOne({ uuid: training_uuid });
      if (!training) {
        throw new Error('Training not found');
      }

      const trainingEpochs = await Epoch.find({ trainingId: training._id.toString() }, 'epoch_uuid');
      const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);

      if (trainingEpochUuids.length === 0) {
        return { testResults: [], total: 0 };
      }

      query = query.where('epoch_uuid').in(trainingEpochUuids);
    }

    // Filter by epoch if provided
    if (epoch !== undefined) {
      query = query.where('epoch').equals(epoch);
    }

    // Filter by epoch_uuids if provided
    if (epoch_uuids && epoch_uuids.length > 0) {
      query = query.where('epoch_uuid').in(epoch_uuids);
    }

    query = query.sort({ [sortField]: sortOrder });

    let testResults;
    let total = 0;

    if (page && limit) {
      const skip = (page - 1) * limit;
      
      // Build count query based on filters
      let countQuery: any = { deletedAt: null };
      if (projectId) {
        const trainings = await Training.find({ projectId, deletedAt: null });
        if (trainings.length > 0) {
          const trainingIds = trainings.map(t => t._id.toString());
          const trainingEpochs = await Epoch.find({ trainingId: { $in: trainingIds } }, 'epoch_uuid');
          const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);
          countQuery.epoch_uuid = { $in: trainingEpochUuids };
        } else {
          countQuery.epoch_uuid = { $in: [] };
        }
      } else if (training_uuid) {
        const training = await Training.findOne({ uuid: training_uuid, deletedAt: null });
        if (training) {
          const trainingEpochs = await Epoch.find({ trainingId: training._id.toString() }, 'epoch_uuid');
          const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);
          countQuery.epoch_uuid = { $in: trainingEpochUuids };
        }
      } else if (epoch !== undefined) {
        countQuery.epoch = epoch;
      } else if (epoch_uuids && epoch_uuids.length > 0) {
        countQuery.epoch_uuid = { $in: epoch_uuids };
      }

      const [results, count] = await Promise.all([
        query.skip(skip).limit(limit),
        TestResult.countDocuments(countQuery)
      ]);
      testResults = results;
      total = count;
    } else {
      testResults = await query;
      total = testResults.length;
    }

    // Enrich with training info
    const epochUuids = testResults.map(tr => tr.epoch_uuid);
    const epochs = await Epoch.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });
    const trainingIds = epochs.map(e => e.trainingId);
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

    const epochMap = epochs.reduce((acc, epoch) => {
      acc[epoch.epoch_uuid] = epoch;
      return acc;
    }, {} as Record<string, any>);

    const trainingMap = trainings.reduce((acc, training) => {
      acc[(training._id as any).toString()] = training;
      return acc;
    }, {} as Record<string, any>);

    const filteredTestResults = testResults.filter(testResult => {
      const epoch = epochMap[testResult.epoch_uuid];
      if (!epoch) return false;
      const training = trainingMap[epoch.trainingId.toString()];
      return training !== undefined;
    });

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

    const actualTotal = page && limit ? filteredTestResults.length : total; // Note: total count logic in controller was a bit weird when filtering happens after DB query. 
    // Ideally we should filter in DB query, but structure makes it hard. 
    // For now keeping logic similar but returning what controller expects.
    
    // If pagination was requested, we return pagination info
    if (page && limit) {
       return {
        testResults: testResultsWithTraining,
        pagination: {
          page,
          limit,
          total: actualTotal, // This might be inaccurate if post-filtering removed items, but consistent with original code
          pages: Math.ceil(actualTotal / limit)
        }
      };
    }

    return {
      testResults: testResultsWithTraining,
      total: filteredTestResults.length
    };
  },

  async getTestResultById(id: string) {
    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });
    if (!testResult) {
      throw new Error('Test result not found');
    }
    return testResult;
  },

  async getTestResultByTestUuid(testUuid: string) {
    const testResult = await TestResult.findOne({ test_uuid: testUuid, deletedAt: null });
    if (!testResult) {
      throw new Error('Test result not found');
    }
    return testResult;
  },

  async getTestResultsByEpochUuid(epochUuid: string, pagination: PaginationOptions) {
    const { page, limit, sortBy = 'timestamp', order = 'desc' } = pagination;
    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy;

    let query = TestResult.find({ epoch_uuid: epochUuid, deletedAt: null }).sort({ [sortField]: sortOrder });

    let testResults;
    let total = 0;

    if (page && limit) {
      const skip = (page - 1) * limit;
      const [results, count] = await Promise.all([
        query.skip(skip).limit(limit),
        TestResult.countDocuments({ epoch_uuid: epochUuid, deletedAt: null })
      ]);
      testResults = results;
      total = count;
    } else {
      testResults = await query;
      total = testResults.length;
    }

    // Enrich
    const epochs = await Epoch.find({ epoch_uuid: epochUuid, deletedAt: null });
    const trainingIds = epochs.map(e => e.trainingId);
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

    const epochMap = epochs.reduce((acc, epoch) => {
      acc[epoch.epoch_uuid] = epoch;
      return acc;
    }, {} as Record<string, any>);

    const trainingMap = trainings.reduce((acc, training) => {
      acc[(training._id as any).toString()] = training;
      return acc;
    }, {} as Record<string, any>);

    const filteredTestResults = testResults.filter(testResult => {
      const epoch = epochMap[testResult.epoch_uuid];
      if (!epoch) return false;
      const training = trainingMap[epoch.trainingId.toString()];
      return training !== undefined;
    });

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

    if (page && limit) {
      return {
        testResults: testResultsWithTraining,
        pagination: {
          page,
          limit,
          total: filteredTestResults.length,
          pages: Math.ceil(filteredTestResults.length / limit)
        }
      };
    }

    return {
      testResults: testResultsWithTraining,
      total: filteredTestResults.length
    };
  },

  async createTestResult(data: any) {
    const { timestamp, epoch, epoch_uuid, test_uuid, test_results } = data;

    if (epoch === undefined || epoch === null) throw new Error('Epoch number is required');
    if (!epoch_uuid) throw new Error('Epoch UUID is required');
    if (!test_results) throw new Error('Test results are required');

    if (test_uuid) {
      const existing = await TestResult.findOne({ test_uuid });
      if (existing) throw new Error(`Test result with test_uuid ${test_uuid} already exists`);
    }

    const testResultData = new TestResult({
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      epoch,
      epoch_uuid,
      test_uuid: test_uuid || uuidv4(),
      test_results
    });

    const savedTestResult = await testResultData.save();

    // Update timestamps
    try {
      const epochDoc = await Epoch.findOne({ epoch_uuid });
      if (epochDoc) {
        await Epoch.findByIdAndUpdate(epochDoc._id, { updatedAt: new Date() });
        await Training.findByIdAndUpdate(epochDoc.trainingId, { updatedAt: new Date() });
      }
    } catch (e) {
      console.warn('Failed to update epoch/training timestamps:', e);
    }

    return savedTestResult;
  },

  async updateTestResult(id: string, data: any) {
    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });
    if (!testResult) throw new Error('Test result not found');

    const { timestamp, epoch, epoch_uuid, test_results } = data;

    if (timestamp !== undefined) testResult.timestamp = new Date(timestamp);
    if (epoch !== undefined) testResult.epoch = epoch;
    if (epoch_uuid !== undefined) testResult.epoch_uuid = epoch_uuid;
    if (test_results !== undefined) testResult.test_results = test_results;

    const updatedTestResult = await testResult.save();

    try {
      const currentEpochUuid = epoch_uuid !== undefined ? epoch_uuid : testResult.epoch_uuid;
      const epochDoc = await Epoch.findOne({ epoch_uuid: currentEpochUuid });
      if (epochDoc) {
        await Epoch.findByIdAndUpdate(epochDoc._id, { updatedAt: new Date() });
        await Training.findByIdAndUpdate(epochDoc.trainingId, { updatedAt: new Date() });
      }
    } catch (e) {
      console.warn('Failed to update epoch/training timestamps:', e);
    }

    return updatedTestResult;
  },

  async deleteTestResult(id: string) {
    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });
    if (!testResult) throw new Error('Test result not found');

    testResult.deletedAt = new Date();
    await testResult.save();
    return true;
  },

  async getTestResultEpochs() {
    return await TestResult.distinct('epoch').sort();
  },

  async compareTestResults(testResultIds: string[]) {
    if (testResultIds.length > 20) throw new Error('Maximum 20 test results can be compared at once');

    const testResults = await TestResult.find({ _id: { $in: testResultIds }, deletedAt: null });

    const epochUuids = testResults.map(tr => tr.epoch_uuid);
    const epochs = await Epoch.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });
    const trainingIds = epochs.map(e => e.trainingId);
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

    const epochMap = epochs.reduce((acc, epoch) => {
      acc[epoch.epoch_uuid] = epoch;
      return acc;
    }, {} as Record<string, any>);

    const trainingMap = trainings.reduce((acc, training) => {
      acc[(training._id as any).toString()] = training;
      return acc;
    }, {} as Record<string, any>);

    const comparisonData = testResults.map(testResult => {
      const epoch = epochMap[testResult.epoch_uuid];
      const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;

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

    const summary = {
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
    };

    return { comparison: comparisonData, summary };
  },

  async getAggregatedTestResultsByTraining(trainingIds: string[]) {
    if (trainingIds.length > 20) throw new Error('Maximum 20 trainings can be compared at once');

    // Get all epochs for the trainings
    const epochs = await Epoch.find({ trainingId: { $in: trainingIds }, deletedAt: null });
    const epochUuids = epochs.map(e => e.epoch_uuid);

    // Get all test results for these epochs
    const testResults = await TestResult.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });

    // Get training details
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });
    const trainingMap = trainings.reduce((acc, training) => {
      acc[(training._id as any).toString()] = training;
      return acc;
    }, {} as Record<string, any>);

    // Group test results by training
    const trainingTestResults = trainingIds
      .filter(trainingId => trainingMap[trainingId]) // Only process existing trainings
      .map(trainingId => {
        const training = trainingMap[trainingId];
        const trainingEpochs = epochs.filter(e => e.trainingId.toString() === trainingId);
        const trainingEpochUuids = trainingEpochs.map(e => e.epoch_uuid);
        const trainingTestResults = testResults.filter(tr => trainingEpochUuids.includes(tr.epoch_uuid));

        if (trainingTestResults.length === 0) {
          return {
            training: {
              _id: training._id,
              name: training.name,
              uuid: training.uuid,
              status: training.status
            },
            aggregatedResults: null,
            testResultsCount: 0
          };
        }

        // Aggregate metrics across all test results for this training
        // If there are multiple results pick the most recent one based on timestamp
        let aggregatedResults = null;
        if (trainingTestResults.length > 0) {
          // find latest test result
          let latest = trainingTestResults[0];
          for (const tr of trainingTestResults) {
            if (new Date(tr.timestamp) > new Date(latest.timestamp)) {
              latest = tr;
            }
          }
          // aggregate only the latest entry to avoid averaging older runs
          aggregatedResults = this.aggregateTestResults([latest]);
        }

        return {
          training: {
            _id: training._id,
            name: training.name,
            uuid: training.uuid,
            status: training.status
          },
          aggregatedResults,
          testResultsCount: trainingTestResults.length
        };
      });

    return { comparison: trainingTestResults };
  },

  aggregateTestResults(testResults: any[]) {
    if (testResults.length === 0) return null;

    const conditions = Object.keys(testResults[0].test_results).filter(condition => condition !== 'inference_time');
    const classes = new Set<string>();

    // Collect all classes across all test results
    testResults.forEach(tr => {
      Object.values(tr.test_results).forEach((conditionData: any) => {
        if (conditionData && typeof conditionData === 'object') {
          Object.keys(conditionData).forEach(className => {
            if (className !== 'inference_time' && !className.startsWith('mean_')) {
              classes.add(className);
            }
          });
        }
      });
    });

    const classArray = Array.from(classes).sort();
    const aggregatedResults: any = {};

    conditions.forEach(condition => {
      aggregatedResults[condition] = {};

      classArray.forEach(className => {
        const metrics = ['iou', 'recall', 'precision', 'f1_score', 'ap'];
        const classMetrics: any = {};

        metrics.forEach(metric => {
          const values: number[] = [];

          testResults.forEach(tr => {
            const conditionData = tr.test_results[condition];
            if (conditionData && conditionData[className] && typeof conditionData[className] === 'object') {
              const value = conditionData[className][metric];
              if (typeof value === 'number' && !isNaN(value)) {
                values.push(value);
              }
            }
          });

          if (values.length > 0) {
            const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
            const std = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
            classMetrics[metric] = { mean, std };
          }
        });

        if (Object.keys(classMetrics).length > 0) {
          aggregatedResults[condition][className] = classMetrics;
        }
      });

      // Aggregate overall metrics
      const overallMetrics = ['mIoU_foreground', 'mean_accuracy', 'fw_iou', 'pixel_accuracy'];
      const overallData: any = {};

      overallMetrics.forEach(metric => {
        const values: number[] = [];

        testResults.forEach(tr => {
          const conditionData = tr.test_results[condition];
          if (conditionData && conditionData.overall && typeof conditionData.overall === 'object') {
            const value = conditionData.overall[metric];
            if (typeof value === 'number' && !isNaN(value)) {
              values.push(value);
            }
          }
        });

        if (values.length > 0) {
          const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
          const std = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
          overallData[metric] = { mean, std };
        }
      });

      if (Object.keys(overallData).length > 0) {
        aggregatedResults[condition].overall = overallData;
      }
    });

    // Aggregate inference time
    const inferenceTimes: number[] = [];
    testResults.forEach(tr => {
      Object.values(tr.test_results).forEach((conditionData: any) => {
        if (conditionData && conditionData.inference_time && conditionData.inference_time.avg_per_sample_ms) {
          inferenceTimes.push(conditionData.inference_time.avg_per_sample_ms);
        }
      });
    });

    if (inferenceTimes.length > 0) {
      const mean = inferenceTimes.reduce((sum, val) => sum + val, 0) / inferenceTimes.length;
      const std = Math.sqrt(inferenceTimes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / inferenceTimes.length);
      aggregatedResults.inference_time = { avg_per_sample_ms: { mean, std } };
    }

    return aggregatedResults;
  }
};
