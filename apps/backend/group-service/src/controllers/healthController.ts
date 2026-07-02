import { Request, Response } from 'express';
import mongoose from 'mongoose';

/**
 * Health check endpoint with database connectivity
 * Returns comprehensive health status for monitoring
 */
export const healthCheck = async (req: Request, res: Response) => {
  try {
    // Check MongoDB connection
    const mongoState = mongoose.connection.readyState;
    const isMongoHealthy = mongoState === 1; // 1 = connected

    const healthResponse = {
      status: isMongoHealthy ? 'ok' : 'error',
      service: 'group-service',
      type: 'backend',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      description: 'Group collaboration service',
      dependencies: {
        mongodb: isMongoHealthy ? 'connected' : 'disconnected'
      }
    };

    res.status(isMongoHealthy ? 200 : 503).json(healthResponse);
  } catch {
    res.status(503).json({
      status: 'error',
      service: 'group-service',
      type: 'backend',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      description: 'Group collaboration service',
      error: 'Health check failed'
    });
  }
};