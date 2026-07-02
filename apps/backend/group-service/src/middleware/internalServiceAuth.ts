import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface InternalServiceRequest extends Request {
  isInternalService?: boolean;
  serviceIdentifier?: string;
  user?: any; // Add user property for auth compatibility
}

/**
 * Middleware to validate internal service tokens for inter-service communication
 */
export const validateInternalServiceToken = (
  req: InternalServiceRequest,
  res: Response,
  next: NextFunction
) => {
  const internalToken = req.headers['x-internal-token'] as string;
  const serviceId = req.headers['x-service-id'] as string;

  // Check if this is an internal service request
  if (internalToken) {
    const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
    
    if (!expectedToken) {
      console.error('INTERNAL_SERVICE_TOKEN not configured');
      return res.status(500).json({
        success: false,
        message: 'Internal service authentication not configured'
      });
    }

    if (internalToken.length !== expectedToken.length ||
        !crypto.timingSafeEqual(Buffer.from(internalToken), Buffer.from(expectedToken))) {
      console.error(`Invalid internal service token from ${serviceId || 'unknown service'}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid internal service token'
      });
    }

    // Mark as internal service request
    req.isInternalService = true;
    req.serviceIdentifier = serviceId || 'unknown';
    
    console.log(`✅ Internal service authenticated: ${req.serviceIdentifier}`);
    return next();
  }

  // If no internal token, continue with normal auth flow
  next();
};

/**
 * Middleware that allows either authenticated users OR internal services
 */
export const allowUserOrInternalService = (
  req: InternalServiceRequest,
  res: Response,
  next: NextFunction
) => {
  // If already authenticated as internal service, allow
  if (req.isInternalService) {
    return next();
  }

  // Otherwise, require user authentication
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  next();
};
