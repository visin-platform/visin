import { Request, Response } from 'express';

export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: 'ok',
    service: 'vision-service',
    timestamp: new Date().toISOString()
  });
};
