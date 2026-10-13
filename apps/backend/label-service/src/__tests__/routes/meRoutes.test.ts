jest.mock('../../clients/groupServiceClient', () => ({
  getMyGroups: jest.fn(),
  checkMembership: jest.fn(),
}));
jest.mock('../../clients/datasetServiceClient', () => ({
  listDatasetsFor: jest.fn(),
}));

import type { Request, Response } from 'express';
import router from '../../routes/meRoutes';
import { getMyGroups } from '../../clients/groupServiceClient';
import * as datasets from '../../clients/datasetServiceClient';

const mockedGetMyGroups = getMyGroups as jest.Mock;
const mockedDatasets = datasets as unknown as Record<string, jest.Mock>;

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
};

const layers = router.stack as Layer[];

/** Call a route's handler directly, the way the tests above do for /groups. */
const handlerFor = (path: string) =>
  layers.find((layer) => layer.route?.path === path)!.route!.stack[0].handle as (
    req: Request,
    res: Response,
    next: (err?: unknown) => void
  ) => Promise<void>;

const call = async (path: string, req: Partial<Request>) => {
  const res = { json: jest.fn() } as unknown as Response & { json: jest.Mock };
  const next = jest.fn();
  handlerFor(path)({ user: { id: 'u1' }, params: {}, query: {}, ...req } as unknown as Request, res, next);
  // `asyncHandler` catches the handler's promise rather than returning it, so
  // the assertions have to wait for the pending work themselves.
  await new Promise((resolve) => setImmediate(resolve));
  return { res, next };
};

describe('meRoutes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers GET /groups', () => {
    const route = layers.find((layer) => layer.route?.path === '/groups');
    expect(route).toBeDefined();
    expect(Object.keys(route!.route!.methods)).toContain('get');
  });

  it('returns the caller’s groups', async () => {
    mockedGetMyGroups.mockResolvedValue([{ groupId: 'g1', name: 'Team', role: 'owner' }]);
    const handler = layers.find((layer) => layer.route?.path === '/groups')!.route!.stack[0]
      .handle as (req: Request, res: Response, next: (err?: unknown) => void) => void;
    const req = { user: { id: 'u1', email: 'User@X.com' } } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response & { json: jest.Mock };
    const next = jest.fn();

    await handler(req, res, next);

    expect(mockedGetMyGroups).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ groupId: 'g1', name: 'Team', role: 'owner' }] });
    expect(next).not.toHaveBeenCalled();
  });

  it('lists the datasets a job can be built on: those the caller manages', async () => {
    mockedDatasets.listDatasetsFor.mockResolvedValue([{ _id: 'd1', name: 'VLM' }]);

    const { res } = await call('/datasets', {});

    expect(mockedDatasets.listDatasetsFor).toHaveBeenCalledWith('u1', 'manage');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'd1', name: 'VLM' }] });
  });
});
