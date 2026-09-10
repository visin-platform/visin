jest.mock('../../clients/groupServiceClient', () => ({
  getMyGroups: jest.fn(),
}));

import type { Request, Response } from 'express';
import router from '../../routes/meRoutes';
import { getMyGroups } from '../../clients/groupServiceClient';

const mockedGetMyGroups = getMyGroups as jest.Mock;

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
};

const layers = router.stack as Layer[];

describe('meRoutes', () => {
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
});
