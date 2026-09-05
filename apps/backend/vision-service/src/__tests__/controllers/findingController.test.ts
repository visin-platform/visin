import type { Response } from 'express';

jest.mock('../../services/findingService', () => ({
  listFindings: jest.fn(),
  getFinding: jest.fn(),
  createFinding: jest.fn(),
  deleteFinding: jest.fn(),
}));

import * as findingService from '../../services/findingService';
import {
  createFinding,
  deleteFinding,
  getFindingById,
  getFindings,
} from '../../controllers/findingController';
import type { AuthRequest } from '../../middleware/authMiddleware';

const mocked = findingService as unknown as Record<string, jest.Mock>;

const makeRes = () => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { json: jest.Mock; status: jest.Mock };
};

const makeReq = (over: Record<string, unknown> = {}): AuthRequest =>
  ({ query: {}, body: {}, params: {}, user: { id: 'u1' }, ...over }) as unknown as AuthRequest;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.listFindings.mockResolvedValue([]);
  mocked.createFinding.mockResolvedValue({ _id: 'f1' });
});

describe('who a finding is attributed to', () => {
  it('names the assistant when software wrote it', async () => {
    // req.apiKey being set means software is acting; the label is the
    // credential's own name, so the record reads "Claude" not an opaque id.
    await createFinding(
      makeReq({ apiKey: { label: 'Claude', keyId: 'c1', scopes: [], required: 'analysis:write' } }),
      makeRes()
    );

    expect(mocked.createFinding.mock.calls[0][1]).toEqual({
      kind: 'assistant',
      label: 'Claude',
      userId: 'u1',
    });
  });

  it('names the person when they wrote it in the app', async () => {
    await createFinding(makeReq({ user: { id: 'u1', name: 'Toomas' } }), makeRes());

    expect(mocked.createFinding.mock.calls[0][1]).toEqual({
      kind: 'person',
      label: 'Toomas',
      userId: 'u1',
    });
  });

  it('falls back to the email, then to something readable', async () => {
    await createFinding(makeReq({ user: { id: 'u1', email: 'a@b.com' } }), makeRes());
    expect(mocked.createFinding.mock.calls[0][1].label).toBe('a@b.com');

    jest.clearAllMocks();
    mocked.createFinding.mockResolvedValue({ _id: 'f1' });
    await createFinding(makeReq({ user: { id: 'u1' } }), makeRes());
    expect(mocked.createFinding.mock.calls[0][1].label).toBe('You');
  });

  it('rejects an unauthenticated writer', async () => {
    await expect(createFinding(makeReq({ user: undefined }), makeRes())).rejects.toThrow(
      /Not authenticated/
    );
  });
});

describe('reads and deletes', () => {
  it('lists with the caller and their filters', async () => {
    const res = makeRes();

    await getFindings(makeReq({ query: { project: 'clftv2' } }), res);

    expect(mocked.listFindings).toHaveBeenCalledWith('u1', { project: 'clftv2' });
    expect(res.json.mock.calls[0][0]).toEqual({ success: true, data: [] });
  });

  it('reads one by id', async () => {
    mocked.getFinding.mockResolvedValue({ _id: 'f1' });
    const res = makeRes();

    await getFindingById(makeReq({ params: { id: 'f1' } }), res);

    expect(mocked.getFinding).toHaveBeenCalledWith('f1', 'u1');
    expect(res.json.mock.calls[0][0].data).toEqual({ _id: 'f1' });
  });

  it('answers a create with 201', async () => {
    const res = makeRes();

    await createFinding(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('deletes', async () => {
    const res = makeRes();

    await deleteFinding(makeReq({ params: { id: 'f1' } }), res);

    expect(mocked.deleteFinding).toHaveBeenCalledWith('f1', 'u1');
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('serves an anonymous reader, who sees public projects only', async () => {
    await getFindings(makeReq({ user: undefined }), makeRes());

    expect(mocked.listFindings).toHaveBeenCalledWith(undefined, {});
  });
});
