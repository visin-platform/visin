import { Request, Response } from 'express';
import mongoose from 'mongoose';

export interface CreateHealthCheckHandlerOptions {
  serviceName: string;
  description?: string;
  /** Include MongoDB connection status and fail the check (503) if disconnected. */
  checkMongo?: boolean;
}

/**
 * Builds a GET /health handler. Services with a MongoDB dependency should
 * pass checkMongo: true so the endpoint reports 503 while disconnected;
 * services without one get a plain 200 liveness response.
 */
export function createHealthCheckHandler(options: CreateHealthCheckHandlerOptions) {
  const { serviceName, description, checkMongo = false } = options;

  return async (_req: Request, res: Response): Promise<void> => {
    if (!checkMongo) {
      res.status(200).json({
        status: 'ok',
        service: serviceName,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const isMongoHealthy = mongoose.connection.readyState === 1;

      res.status(isMongoHealthy ? 200 : 503).json({
        status: isMongoHealthy ? 'ok' : 'error',
        service: serviceName,
        type: 'backend',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        ...(description && { description }),
        dependencies: {
          mongodb: isMongoHealthy ? 'connected' : 'disconnected'
        }
      });
    } catch {
      res.status(503).json({
        status: 'error',
        service: serviceName,
        type: 'backend',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        ...(description && { description }),
        error: 'Health check failed'
      });
    }
  };
}
