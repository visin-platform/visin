import type { NextFunction, Request, Response } from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/authMiddleware';
import { optionalAuth } from '@visin/backend-core';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  authenticateToken: jest.fn(),
}));
const { authenticateToken } = jest.requireMock('@visin/backend-core') as { authenticateToken: jest.Mock };

const res = {} as Response;

describe('authMiddleware', () => {
  it("is backend-core's required auth", async () => {
    const next = jest.fn() as NextFunction;
    const request = {} as Request;
    await authMiddleware(request, res, next);
    expect(authenticateToken).toHaveBeenCalledWith(request, res, next);
  });

  it("keeps optional auth as backend-core's", () => {
    expect(optionalAuthMiddleware).toBe(optionalAuth);
  });
});
