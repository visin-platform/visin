import { useMongo } from '../helpers/mongo';
useMongo();
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { generateUploadUrl, generateDownloadUrl } from '../../controllers/signedUrlController';
import { verifyToken } from '../../utils/hmac';

const makeRes = () => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { json: jest.Mock };
};

const makeReq = (body: Record<string, unknown>): Request => ({ body } as unknown as Request);

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-upload-'));
  process.env.FILE_SERVICE_DATA_DIR = directory;
  process.env.FILE_SERVICE_HMAC_SECRET = 'test-hmac-secret';
  process.env.FILE_SERVICE_URL = 'https://files.example.com/';
});

afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); delete process.env.FILE_SERVICE_DATA_DIR; });

afterAll(() => {
  delete process.env.FILE_SERVICE_HMAC_SECRET;
  delete process.env.FILE_SERVICE_URL;
});

describe('generateUploadUrl', () => {
  it('returns a signed upload URL with a verifiable token', async () => {
    const res = makeRes();

    (await generateUploadUrl(makeReq({ fileId: 'grp/alb/file.jpg', expiresInMinutes: 15 }), res));

    const { data } = res.json.mock.calls[0][0];
    expect(data.uploadUrl).toMatch(
      /^https:\/\/files\.example\.com\/files\/upload\/grp\/alb\/file\.jpg\?token=[0-9a-f]+&expires=\d+&reservation=[a-f0-9-]+$/
    );
    expect(data.fileId).toBe('grp/alb/file.jpg');
    expect(data.expiresMs).toBeGreaterThan(Date.now());

    const token = new URL(data.uploadUrl).searchParams.get('token')!;
    expect(verifyToken('upload', 'grp/alb/file.jpg', data.expiresMs, token, new URL(data.uploadUrl).searchParams.get('reservation')!)).toBe(true);
  });

  it('falls back to localhost when FILE_SERVICE_URL is unset', async () => {
    delete process.env.FILE_SERVICE_URL;
    const res = makeRes();

    (await generateUploadUrl(makeReq({ fileId: 'f.jpg', expiresInMinutes: 5 }), res));

    expect(res.json.mock.calls[0][0].data.uploadUrl).toMatch(/^http:\/\/localhost:5002\//);
  });
});

describe('generateDownloadUrl', () => {
  it('returns a signed download URL with a verifiable token', async () => {
    const res = makeRes();

    generateDownloadUrl(makeReq({ fileId: 'grp/alb/file.jpg', expiresInMinutes: 60 }), res);

    const { data } = res.json.mock.calls[0][0];
    expect(data.downloadUrl).toContain('/files/download/grp/alb/file.jpg?token=');

    const token = new URL(data.downloadUrl).searchParams.get('token')!;
    expect(verifyToken('download', 'grp/alb/file.jpg', data.expiresMs, token)).toBe(true);
  });
});
