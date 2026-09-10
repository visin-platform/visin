import { assertEpochWrite } from './writeAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter } from 'mongoose';
import { projectTokenContext, tokenProjectId } from '../middleware/projectTokenContext';
import { ConflictError, ForbiddenError, NotFoundError, logger } from '@visin/backend-core';
import TestResult, { ITestResult } from '../models/TestResult';
import Epoch, { IEpoch } from '../models/Epoch';
import Training, { ITraining } from '../models/Training';
import { checkProjectAccess, createProjectAccessChecker, getVisibleTrainingIds, isWithinTokenScope } from './projectAccessService';
import type { z } from '@visin/backend-core';
import type { createTestResultBodySchema, updateTestResultBodySchema } from '../validation/testResultSchemas';

type CreateTestResultData = z.infer<typeof createTestResultBodySchema>;
type UpdateTestResultData = z.infer<typeof updateTestResultBodySchema>;

// aggregateTestResults only touches `test_results`, and that field's real shape is a
// dynamic per-condition/per-class metrics blob (plus "overall"/"inference_time"
// pseudo-keys) that doesn't line up with ITestResult's declared per-class shape —
// so it's typed against just what's used here rather than the full Mongoose document.
export interface TestResultLike {
  test_results: Record<string, Record<string, unknown>>;
}
export interface MetricStat {
  mean: number;
  std: number;
}
// Depth below the condition/class level is genuinely dynamic (a "car"/"truck"/"overall"
// key maps to a metric-name→MetricStat dict, while the "inference_time" pseudo-condition
// maps straight to one) — callers narrow the specific sub-shape they expect.
export type AggregatedResults = Record<string, Record<string, unknown>>;

interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy: string;
  order: 1 | -1;
}

interface TestResultFilters {
  epoch?: number;
  epoch_uuids?: string[];
  training_uuid?: string;
  projectId?: string;
}

export const testResultService = {
  async getTestResults(userId: string | undefined, filters: TestResultFilters, pagination: PaginationOptions) {
    const { page, limit, sortBy, order } = pagination;
    const { epoch, epoch_uuids, training_uuid, projectId } = filters;

    let query = TestResult.find({ deletedAt: null });
    // Caller filters must never replace this mandatory authorization predicate.
    let tokenEpochFilter: QueryFilter<ITestResult> | undefined;
    if (tokenProjectId()) {
      const ids = await getVisibleTrainingIds(userId);
      const epochs = await Epoch.find({ trainingId: { $in: ids }, deletedAt: null }, 'epoch_uuid');
      tokenEpochFilter = { epoch_uuid: { $in: epochs.map(row => row.epoch_uuid) } };
      query = query.and([tokenEpochFilter]);
    }

    // Filter by projectId if provided
    if (projectId) {
      if (!(await checkProjectAccess(userId, projectId))) {
        throw new ForbiddenError('Access denied to project');
      }
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
        throw new NotFoundError('Training not found');
      }
      if (!(await checkProjectAccess(userId, training.projectId))) {
        throw new ForbiddenError('Access denied to project');
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

    // No project/training/epoch filter given at all: scope to epochs whose
    // training is visible to the caller — otherwise this returns every
    // project's test results regardless of privacy.
    const noFilterGiven = !projectId && !training_uuid && epoch === undefined && !(epoch_uuids && epoch_uuids.length > 0);
    if (noFilterGiven) {
      const visibleTrainingIds = await getVisibleTrainingIds(userId);
      const visibleEpochs = await Epoch.find({ trainingId: { $in: visibleTrainingIds } }, 'epoch_uuid');
      query = query.where('epoch_uuid').in(visibleEpochs.map(e => e.epoch_uuid));
    }

    query = query.sort({ [sortBy]: order });

    let testResults;
    let total: number;

    if (page && limit) {
      const skip = (page - 1) * limit;
      
      // Build count query based on filters
      const countQuery: QueryFilter<ITestResult> = { deletedAt: null };
      if (tokenEpochFilter) countQuery.$and = [tokenEpochFilter];
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
      } else {
        const visibleTrainingIds = await getVisibleTrainingIds(userId);
        const visibleEpochs = await Epoch.find({ trainingId: { $in: visibleTrainingIds } }, 'epoch_uuid');
        countQuery.epoch_uuid = { $in: visibleEpochs.map(e => e.epoch_uuid) };
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
    }, {} as Record<string, IEpoch>);

    const trainingMap = trainings.reduce((acc, training) => {
      acc[training._id.toString()] = training;
      return acc;
    }, {} as Record<string, ITraining>);

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

  async getTestResultById(id: string, userId: string | undefined) {
    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });
    if (!testResult) {
      throw new NotFoundError('Test result not found');
    }
    if (!(await this.checkTestResultAccess(testResult.epoch_uuid, userId))) {
      throw new ForbiddenError();
    }
    return testResult;
  },

  async getTestResultByTestUuid(testUuid: string, userId: string | undefined) {
    const testResult = await TestResult.findOne({ test_uuid: testUuid, deletedAt: null });
    if (!testResult) {
      throw new NotFoundError('Test result not found');
    }
    if (!(await this.checkTestResultAccess(testResult.epoch_uuid, userId))) {
      throw new ForbiddenError();
    }
    return testResult;
  },

  /**
   * Resolves a test result's parent training (via its epoch) and checks
   * project access. `reqProjectId`, when passed, additionally enforces that
   * the training belongs to that project — used on writes to keep a
   * project-scoped API token inside its own project.
   */
  async checkTestResultAccess(epochUuid: string, userId: string | undefined, reqProjectId?: string): Promise<boolean> {
    const epoch = await Epoch.findOne({ epoch_uuid: epochUuid });
    if (!epoch) return isWithinTokenScope(reqProjectId, undefined);
    const training = await Training.findById(epoch.trainingId);
    if (!(await checkProjectAccess(userId, training?.projectId))) return false;
    return isWithinTokenScope(reqProjectId, training?.projectId);
  },

  async getTestResultsByEpochUuid(epochUuid: string, userId: string | undefined, pagination: PaginationOptions) {
    if (!(await this.checkTestResultAccess(epochUuid, userId))) {
      throw new ForbiddenError();
    }
    const { page, limit, sortBy, order } = pagination;

    const query = TestResult.find({ epoch_uuid: epochUuid, deletedAt: null }).sort({ [sortBy]: order });

    let testResults;

    if (page && limit) {
      const skip = (page - 1) * limit;
      testResults = await query.skip(skip).limit(limit);
    } else {
      testResults = await query;
    }

    // Enrich
    const epochs = await Epoch.find({ epoch_uuid: epochUuid, deletedAt: null });
    const trainingIds = epochs.map(e => e.trainingId);
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

    const epochMap = epochs.reduce((acc, epoch) => {
      acc[epoch.epoch_uuid] = epoch;
      return acc;
    }, {} as Record<string, IEpoch>);

    const trainingMap = trainings.reduce((acc, training) => {
      acc[training._id.toString()] = training;
      return acc;
    }, {} as Record<string, ITraining>);

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

  async createTestResult(userId: string | undefined, reqProjectId: string | undefined, data: CreateTestResultData) {
    const { timestamp, epoch, epoch_uuid, test_uuid, test_results } = data;

    if (test_uuid) {
      const existing = await TestResult.findOne({ test_uuid });
      if (existing) throw new ConflictError(`Test result with test_uuid ${test_uuid} already exists`);
    }

    const epochDoc = await assertEpochWrite(epoch_uuid, userId, reqProjectId);
    if (!epochDoc && !isWithinTokenScope(reqProjectId, undefined)) throw new ForbiddenError();
    if (epochDoc) {
      const training = await Training.findById(epochDoc.trainingId);
      if (!(await checkProjectAccess(userId, training?.projectId)) || !isWithinTokenScope(reqProjectId, training?.projectId)) {
        throw new ForbiddenError();
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

    // Update timestamps
    try {
      if (epochDoc) {
        await Epoch.findByIdAndUpdate(epochDoc._id, { updatedAt: new Date() });
        await Training.findByIdAndUpdate(epochDoc.trainingId, { updatedAt: new Date() });
      }
    } catch (e) {
      logger.warn('Failed to update epoch/training timestamps', { error: (e as Error).message });
    }

    return savedTestResult;
  },

  async updateTestResult(id: string, userId: string | undefined, reqProjectId: string | undefined, data: UpdateTestResultData) {
    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });
    if (!testResult) throw new NotFoundError('Test result not found');
    await assertEpochWrite(testResult.epoch_uuid, userId, reqProjectId);
    if (!(await this.checkTestResultAccess(testResult.epoch_uuid, userId, reqProjectId))) {
      throw new ForbiddenError();
    }

    const { timestamp, epoch, epoch_uuid, test_results } = data;
    if (epoch_uuid !== undefined) await assertEpochWrite(epoch_uuid, userId, reqProjectId);
    if (epoch_uuid !== undefined && !(await this.checkTestResultAccess(epoch_uuid, userId, reqProjectId))) {
      throw new ForbiddenError();
    }

    if (timestamp !== undefined) testResult.timestamp = new Date(timestamp);
    if (epoch !== undefined) testResult.epoch = epoch;
    if (epoch_uuid !== undefined) testResult.epoch_uuid = epoch_uuid;
    if (test_results !== undefined) testResult.test_results = test_results as ITestResult['test_results'];

    const updatedTestResult = await testResult.save();

    try {
      const currentEpochUuid = epoch_uuid !== undefined ? epoch_uuid : testResult.epoch_uuid;
      const epochDoc = await Epoch.findOne({ epoch_uuid: currentEpochUuid });
      if (epochDoc) {
        await Epoch.findByIdAndUpdate(epochDoc._id, { updatedAt: new Date() });
        await Training.findByIdAndUpdate(epochDoc.trainingId, { updatedAt: new Date() });
      }
    } catch (e) {
      logger.warn('Failed to update epoch/training timestamps', { error: (e as Error).message });
    }

    return updatedTestResult;
  },

  async deleteTestResult(id: string, userId: string | undefined, reqProjectId: string | undefined) {
    const testResult = await TestResult.findOne({ _id: id, deletedAt: null });
    if (!testResult) throw new NotFoundError('Test result not found');
    await assertEpochWrite(testResult.epoch_uuid, userId, reqProjectId);
    if (!(await this.checkTestResultAccess(testResult.epoch_uuid, userId, reqProjectId))) {
      throw new ForbiddenError();
    }

    testResult.deletedAt = new Date();
    await testResult.save();
    return true;
  },

  async getTestResultEpochs() {
    const context = projectTokenContext.getStore();
    if (context) {
      const ids = await getVisibleTrainingIds(context.userId);
      const epochs = await Epoch.find({ trainingId: { $in: ids }, deletedAt: null }, 'epoch_uuid');
      return TestResult.distinct('epoch', { epoch_uuid: { $in: epochs.map(row => row.epoch_uuid) }, deletedAt: null }).sort();
    }
    return await TestResult.distinct('epoch').sort();
  },

  async compareTestResults(userId: string | undefined, testResultIds: string[]) {
    const foundTestResults = await TestResult.find({ _id: { $in: testResultIds }, deletedAt: null });

    const epochUuids = foundTestResults.map(tr => tr.epoch_uuid);
    const epochs = await Epoch.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });
    const trainingIds = epochs.map(e => e.trainingId);
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });

    const epochMap = epochs.reduce((acc, epoch) => {
      acc[epoch.epoch_uuid] = epoch;
      return acc;
    }, {} as Record<string, IEpoch>);

    const trainingMap = trainings.reduce((acc, training) => {
      acc[training._id.toString()] = training;
      return acc;
    }, {} as Record<string, ITraining>);

    // Silently drop test results whose training's project isn't visible to
    // the caller — comparing arbitrary ids shouldn't leak private-project data.
    // Memoized per request: many rows usually share a handful of projects.
    const hasProjectAccess = createProjectAccessChecker(userId);
    const testResults = [];
    for (const testResult of foundTestResults) {
      const epoch = epochMap[testResult.epoch_uuid];
      const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;
      if (await hasProjectAccess(training?.projectId)) {
        testResults.push(testResult);
      }
    }

    const comparisonData = testResults.map(testResult => {
      const epoch = epochMap[testResult.epoch_uuid];
      const training = epoch ? trainingMap[epoch.trainingId.toString()] : null;

      const filteredTestResults: Record<string, Record<string, unknown>> = {};
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
          Object.values(comp.test_results).forEach((conditionData) => {
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

  async getAggregatedTestResultsByTraining(userId: string | undefined, trainingIds: string[]) {
    // Get all epochs for the trainings
    const epochs = await Epoch.find({ trainingId: { $in: trainingIds }, deletedAt: null });
    const epochUuids = epochs.map(e => e.epoch_uuid);

    // Get all test results for these epochs
    const testResults = await TestResult.find({ epoch_uuid: { $in: epochUuids }, deletedAt: null });

    // Get training details
    const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });
    const trainingMap = trainings.reduce((acc, training) => {
      acc[training._id.toString()] = training;
      return acc;
    }, {} as Record<string, ITraining>);

    // Silently drop trainings whose project isn't visible to the caller —
    // comparing arbitrary ids shouldn't leak private-project data.
    const hasProjectAccess = createProjectAccessChecker(userId);
    const visibleTrainingIds = new Set<string>();
    for (const trainingId of trainingIds) {
      const training = trainingMap[trainingId];
      if (training && (await hasProjectAccess(training.projectId))) {
        visibleTrainingIds.add(trainingId);
      }
    }

    // Group test results by training
    const trainingTestResults = trainingIds
      .filter(trainingId => visibleTrainingIds.has(trainingId)) // Only process existing, visible trainings
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

  aggregateTestResults(testResults: TestResultLike[]): AggregatedResults | null {
    if (testResults.length === 0) return null;

    const conditions = Object.keys(testResults[0].test_results).filter(condition => condition !== 'inference_time');
    const classes = new Set<string>();

    // Collect all classes across all test results
    testResults.forEach(tr => {
      Object.values(tr.test_results).forEach((conditionData) => {
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
    const aggregatedResults: AggregatedResults = {};

    conditions.forEach(condition => {
      aggregatedResults[condition] = {};

      classArray.forEach(className => {
        const metrics = ['iou', 'recall', 'precision', 'f1_score', 'ap'];
        const classMetrics: Record<string, MetricStat> = {};

        metrics.forEach(metric => {
          const values: number[] = [];

          testResults.forEach(tr => {
            const conditionData = tr.test_results[condition];
            const classData = conditionData?.[className];
            if (classData && typeof classData === 'object') {
              const value = (classData as Record<string, unknown>)[metric];
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
      const overallData: Record<string, MetricStat> = {};

      overallMetrics.forEach(metric => {
        const values: number[] = [];

        testResults.forEach(tr => {
          const conditionData = tr.test_results[condition];
          const overall = conditionData?.overall;
          if (overall && typeof overall === 'object') {
            const value = (overall as Record<string, unknown>)[metric];
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
      Object.values(tr.test_results).forEach((conditionData) => {
        const inferenceTime = conditionData?.inference_time as { avg_per_sample_ms?: number } | undefined;
        if (inferenceTime?.avg_per_sample_ms) {
          inferenceTimes.push(inferenceTime.avg_per_sample_ms);
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
