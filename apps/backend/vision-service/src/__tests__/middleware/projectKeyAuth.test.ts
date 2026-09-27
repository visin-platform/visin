jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  apiKeyAuth: jest.fn()
}));

import type { NextFunction, Request, Response } from 'express';
import { apiKeyAuth } from '@visin/backend-core';
import { projectKeyAuth } from '../../middleware/projectKeyAuth';
import { tokenProjectId } from '../../middleware/projectTokenContext';

const mockedApiKeyAuth = apiKeyAuth as jest.Mock;

/** backend-core's guard, standing in: it authenticates as `outcome` says, then calls on. */
const guardThat = (outcome: (req: Request) => unknown) =>
  mockedApiKeyAuth.mockReturnValue((req: Request, _res: Response, next: NextFunction) => next(outcome(req)));

describe('projectKeyAuth', () => {
  it('runs the rest of a limited key’s request confined to its project', async () => {
    guardThat(req => {
      req.user = { id: 'u1' };
      req.apiKey = { keyId: 'k', scopes: ['vision:write'], label: 'pipeline', required: 'vision:write', projectId: 'p1' };
    });
    const req = {} as Request;
    let seen: { project?: string } = {};

    await projectKeyAuth('vision')(req, {} as Response, () => {
      seen = { project: tokenProjectId() };
    });

    expect(mockedApiKeyAuth).toHaveBeenCalledWith('vision', undefined);
    expect(req.projectId).toBe('p1');
    expect(seen).toEqual({ project: 'p1' });
  });

  it('adds nothing for an unlimited key or a request without one', async () => {
    guardThat(req => {
      req.user = { id: 'u1' };
    });
    const next = jest.fn(() => expect(tokenProjectId()).toBeUndefined());

    await projectKeyAuth('vision')({} as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes a refusal straight on', async () => {
    const refusal = new Error('refused');
    guardThat(() => refusal);
    const next = jest.fn();

    await projectKeyAuth('analysis', { readPaths: [] })({} as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(refusal);
  });
});
