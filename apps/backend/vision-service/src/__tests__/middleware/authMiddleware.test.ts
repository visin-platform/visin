import { vi, type Mock } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/authMiddleware';
import { optionalAuth } from '@visin/backend-core';

vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    authenticateToken: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
const { authenticateToken } = (await import('@visin/backend-core')) as { authenticateToken: Mock };

const res = {} as Response;

describe('authMiddleware', () => {
  it("is backend-core's required auth", async () => {
    const next = vi.fn() as NextFunction;
    const request = {} as Request;
    await authMiddleware(request, res, next);
    expect(authenticateToken).toHaveBeenCalledWith(request, res, next);
  });

  it("keeps optional auth as backend-core's", () => {
    expect(optionalAuthMiddleware).toBe(optionalAuth);
  });
});
