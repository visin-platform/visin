import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Benchmark, { IBenchmark } from '../models/Benchmark';
import Training from '../models/Training';

// Get all benchmarks
export const getBenchmarks = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 25,
      training_uuid,
      projectId,
      sortBy = 'timestamp',
      order = 'desc'
    } = req.query;

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy as string;

    let query: any = { deletedAt: null };

    // Filter by projectId if provided
    if (projectId) {
      // Find all trainings for this project
      const trainings = await Training.find({ projectId: projectId as string, deletedAt: null });
      if (trainings.length === 0) {
        res.json({
          success: true,
          data: {
            benchmarks: [],
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: 0,
              pages: 0
            }
          }
        });
        return;
      }

      // Get training IDs for these trainings
      const trainingIds = trainings.map(t => t._id.toString());
      query.training_id = { $in: trainingIds };
    }
    // Filter by training UUID if provided
    else if (training_uuid) {
      query.training_uuid = training_uuid;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [benchmarks, total] = await Promise.all([
      Benchmark.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(Number(limit)),
      Benchmark.countDocuments(query)
    ]);

    // Get unique training IDs from benchmarks
    const trainingIds = [...new Set(
      benchmarks
        .map(b => b.training_id)
        .filter(id => id != null)
    )];

    // Fetch training data if we have training IDs
    let trainingMap = new Map();
    if (trainingIds.length > 0) {
      try {
        const trainings = await Training.find({
          _id: { $in: trainingIds },
          deletedAt: null
        }).select('name uuid');
        
        trainingMap = new Map(
          trainings.map(training => [(training._id as any).toString(), training])
        );
      } catch (populateError) {
        console.warn('Failed to fetch training data:', populateError);
        // Continue without training data
      }
    }

    // Add training data to benchmarks
    const benchmarksWithTraining = benchmarks.map(benchmark => ({
      ...benchmark.toObject(),
      training_id: benchmark.training_id ? trainingMap.get(benchmark.training_id.toString()) || null : null
    }));

    res.json({
      success: true,
      data: {
        benchmarks: benchmarksWithTraining,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch benchmarks'
    });
  }
};

// Get benchmark by ID
export const getBenchmarkById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const benchmark = await Benchmark.findOne({ _id: id, deletedAt: null })
      .populate('training_id', 'name uuid projectId');

    if (!benchmark) {
      res.status(404).json({
        success: false,
        message: 'Benchmark not found'
      });
      return;
    }

    res.json({
      success: true,
      data: benchmark
    });
  } catch (error) {
    console.error('Error fetching benchmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch benchmark'
    });
  }
};

// Create benchmark from JSON data
export const createBenchmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const benchmarkData = req.body;

    // Validate required fields
    if (!benchmarkData.timestamp) {
      res.status(400).json({
        success: false,
        message: 'timestamp field is required'
      });
      return;
    }

    if (!benchmarkData.system_info) {
      res.status(400).json({
        success: false,
        message: 'system_info field is required'
      });
      return;
    }

    if (!benchmarkData.results || !Array.isArray(benchmarkData.results)) {
      res.status(400).json({
        success: false,
        message: 'results field must be an array'
      });
      return;
    }

    // Validate system_info structure
    const { system_info } = benchmarkData;
    if (typeof system_info.cpu_count !== 'number' ||
        typeof system_info.cpu_count_logical !== 'number' ||
        typeof system_info.memory_total_gb !== 'number') {
      res.status(400).json({
        success: false,
        message: 'system_info must contain cpu_count, cpu_count_logical, and memory_total_gb as numbers'
      });
      return;
    }

    // Look up training_id if training_uuid is provided
    let training_id = null;
    if (benchmarkData.training_uuid) {
      try {
        const training = await Training.findOne({ uuid: benchmarkData.training_uuid, deletedAt: null });
        if (training) {
          training_id = training._id;
        }
      } catch (error) {
        console.warn('Failed to find training for uuid:', benchmarkData.training_uuid, error);
        // Don't fail the request if training lookup fails
      }
    }

    const benchmark = new Benchmark({
      training_uuid: benchmarkData.training_uuid,
      training_id: training_id,
      epoch_uuid: benchmarkData.epoch_uuid,
      epoch: benchmarkData.epoch,
      timestamp: new Date(benchmarkData.timestamp),
      system_info: benchmarkData.system_info,
      results: benchmarkData.results
    });

    const savedBenchmark = await benchmark.save();

    // Update training timestamp if training_uuid is provided
    if (benchmarkData.training_uuid) {
      try {
        await Training.findOneAndUpdate(
          { uuid: benchmarkData.training_uuid },
          { updatedAt: new Date() }
        );
      } catch (updateError) {
        console.warn('Failed to update training timestamp:', updateError);
        // Don't fail the request if timestamp update fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Benchmark created successfully',
      data: savedBenchmark
    });
  } catch (error) {
    console.error('Error creating benchmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create benchmark'
    });
  }
};

// Upload benchmark from JSON file
export const uploadBenchmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const benchmarkData = req.body;

    // Validate required fields
    if (!benchmarkData.timestamp) {
      res.status(400).json({
        success: false,
        message: 'timestamp field is required'
      });
      return;
    }

    if (!benchmarkData.system_info) {
      res.status(400).json({
        success: false,
        message: 'system_info field is required'
      });
      return;
    }

    if (!benchmarkData.results || !Array.isArray(benchmarkData.results)) {
      res.status(400).json({
        success: false,
        message: 'results field must be an array'
      });
      return;
    }

    // Look up training_id if training_uuid is provided
    let training_id = null;
    if (benchmarkData.training_uuid) {
      try {
        const training = await Training.findOne({ uuid: benchmarkData.training_uuid, deletedAt: null });
        if (training) {
          training_id = training._id;
        }
      } catch (error) {
        console.warn('Failed to find training for uuid:', benchmarkData.training_uuid, error);
        // Don't fail the request if training lookup fails
      }
    }

    const benchmark = new Benchmark({
      training_uuid: benchmarkData.training_uuid,
      training_id: training_id,
      epoch_uuid: benchmarkData.epoch_uuid,
      epoch: benchmarkData.epoch,
      timestamp: new Date(benchmarkData.timestamp),
      system_info: benchmarkData.system_info,
      results: benchmarkData.results
    });

    const savedBenchmark = await benchmark.save();

    // Update training timestamp if training_uuid is provided
    if (benchmarkData.training_uuid) {
      try {
        await Training.findOneAndUpdate(
          { uuid: benchmarkData.training_uuid, deletedAt: null },
          { updatedAt: new Date() }
        );
      } catch (updateError) {
        console.warn('Failed to update training timestamp:', updateError);
        // Don't fail the request if timestamp update fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Benchmark uploaded successfully',
      data: savedBenchmark
    });
  } catch (error) {
    console.error('Error uploading benchmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload benchmark'
    });
  }
};

// Update benchmark
export const updateBenchmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const benchmark = await Benchmark.findOne({ _id: id, deletedAt: null });

    if (!benchmark) {
      res.status(404).json({
        success: false,
        message: 'Benchmark not found'
      });
      return;
    }

    // Look up training_id if training_uuid is being updated
    if (updateData.training_uuid) {
      try {
        const training = await Training.findOne({ uuid: updateData.training_uuid, deletedAt: null });
        if (training) {
          updateData.training_id = training._id;
        }
      } catch (error) {
        console.warn('Failed to find training for uuid:', updateData.training_uuid, error);
        // Don't fail the request if training lookup fails
      }
    }

    // Update fields
    if (updateData.training_uuid !== undefined) benchmark.training_uuid = updateData.training_uuid;
    if (updateData.training_id !== undefined) benchmark.training_id = updateData.training_id;
    if (updateData.epoch_uuid !== undefined) benchmark.epoch_uuid = updateData.epoch_uuid;
    if (updateData.epoch !== undefined) benchmark.epoch = updateData.epoch;
    if (updateData.timestamp !== undefined) benchmark.timestamp = new Date(updateData.timestamp);
    if (updateData.system_info !== undefined) benchmark.system_info = updateData.system_info;
    if (updateData.results !== undefined) benchmark.results = updateData.results;

    const updatedBenchmark = await benchmark.save();

    res.json({
      success: true,
      message: 'Benchmark updated successfully',
      data: updatedBenchmark
    });
  } catch (error) {
    console.error('Error updating benchmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update benchmark'
    });
  }
};

// Delete benchmark (hard delete)
export const deleteBenchmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const benchmark = await Benchmark.findByIdAndDelete(id);

    if (!benchmark) {
      res.status(404).json({
        success: false,
        message: 'Benchmark not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Benchmark deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting benchmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete benchmark'
    });
  }
};

// Get benchmark statistics
export const getBenchmarkStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { training_uuid } = req.query;

    let query: any = { deletedAt: null };

    if (training_uuid) {
      query.training_uuid = training_uuid;
    }

    const benchmarks = await Benchmark.find(query);

    // Calculate aggregate statistics
    const stats = {
      totalBenchmarks: benchmarks.length,
      totalResults: benchmarks.reduce((sum, b) => sum + b.results.length, 0),
      avgParameters: 0,
      avgFlops: 0,
      avgFps: 0,
      avgMemoryUsage: 0
    };

    if (benchmarks.length > 0) {
      let totalParameters = 0;
      let totalFlops = 0;
      let totalFps = 0;
      let totalMemory = 0;
      let resultCount = 0;

      benchmarks.forEach(benchmark => {
        benchmark.results.forEach(result => {
          if (result.total_parameters) {
            totalParameters += result.total_parameters;
            resultCount++;
          }
          if (result.flops_giga) totalFlops += result.flops_giga;
          if (result.fps) totalFps += result.fps;
          if (result.gpu_memory_mean_mb) totalMemory += result.gpu_memory_mean_mb;
          else if (result.ram_memory_mean_mb) totalMemory += result.ram_memory_mean_mb;
        });
      });

      if (resultCount > 0) {
        stats.avgParameters = totalParameters / resultCount;
        stats.avgFlops = totalFlops / resultCount;
        stats.avgFps = totalFps / resultCount;
        stats.avgMemoryUsage = totalMemory / resultCount;
      }
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching benchmark stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch benchmark stats'
    });
  }
};